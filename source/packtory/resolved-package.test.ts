import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PackageConfig, PacktoryConfigWithoutRegistry } from '../config/config.ts';
import type { ValidConfigWithoutRegistryResult } from '../config/validation.ts';
import { checkBundle } from '../test-libraries/check-bundle-fixture.ts';
import { analyzedBundleResource, versionedBundleWithManifest } from '../test-libraries/bundle-fixtures.ts';
import { validConfigWithoutRegistryFixture } from '../test-libraries/config-fixtures.ts';
import { createLinkedBundle, createResolveOptions } from '../test-libraries/package-processor-test-support.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import { buildChecksResult, createResolvedPackage, type ResolvedPackage } from './resolved-package.ts';

const validated: (config: Partial<PacktoryConfigWithoutRegistry>) => ValidConfigWithoutRegistryResult =
    validConfigWithoutRegistryFixture;

const unusedCheckDependencies = {
    versionManager: {
        addVersion() {
            throw new Error('versionManager.addVersion should not run for non-ATTW tests');
        }
    }
};

function packageConfig(
    name: string,
    overrides: Partial<PackageConfig> = {}
): PacktoryConfigWithoutRegistry['packages'][number] {
    return { name, roots: {}, ...overrides };
}

function resolvedPackage(name: string, analyzedBundle: ResolvedPackage['analyzedBundle']): ResolvedPackage {
    return { name, analyzedBundle, resolveOptions: createResolveOptions() };
}

function duplicateResolvedPackages(): readonly ResolvedPackage[] {
    return [
        resolvedPackage('pkg-a', checkBundle('pkg-a', [ 'shared.ts' ])),
        resolvedPackage('pkg-b', checkBundle('pkg-b', [ 'shared.ts' ]))
    ];
}

function bundleWithExternal(packageName: string, dependencyName: string): ResolvedPackage['analyzedBundle'] {
    return {
        ...checkBundle(packageName, [ 'shared.ts' ]),
        externalDependencies: new Map([ [ dependencyName, { name: dependencyName, referencedFrom: [ '/x' ] } ] ])
    };
}

async function runSinglePackageChecks(
    config: Partial<PacktoryConfigWithoutRegistry>,
    analyzedBundle: ResolvedPackage['analyzedBundle']
): Promise<Awaited<ReturnType<typeof buildChecksResult>>> {
    return await buildChecksResult(unusedCheckDependencies, validated(config), [
        resolvedPackage('pkg-a', analyzedBundle)
    ]);
}

function createPublishedPackageWithManifest(packageName: string): VersionedBundleWithManifest {
    return versionedBundleWithManifest({
        name: packageName,
        version: '0.0.0',
        contents: [
            analyzedBundleResource('index.js', {
                targetFilePath: 'index.js',
                content: 'export const value = 1;\n'
            }),
            analyzedBundleResource('index.d.ts', {
                targetFilePath: 'index.d.ts',
                content: 'export declare const value = 1;\n'
            })
        ],
        mainFile: {
            sourceFilePath: 'index.js',
            targetFilePath: 'index.js',
            content: 'export const value = 1;\n'
        },
        typesMainFile: {
            sourceFilePath: 'index.d.ts',
            targetFilePath: 'index.d.ts',
            content: 'export declare const value = 1;\n'
        },
        manifestFile: {
            filePath: 'package.json',
            content: JSON.stringify({
                name: packageName,
                version: '0.0.0',
                type: 'module',
                exports: {
                    '.': {
                        types: './index.d.ts',
                        import: './index.js'
                    }
                }
            }),
            isExecutable: false
        },
        packageJson: {
            name: packageName,
            version: '0.0.0'
        }
    });
}

suite('resolved-package', function () {
    test('createResolvedPackage assembles the three fields into a ResolvedPackage', function () {
        const analyzedBundle = checkBundle('pkg-a', []);
        const resolveOptions = createResolveOptions();

        assert.deepStrictEqual(createResolvedPackage('pkg-a', analyzedBundle, resolveOptions), {
            name: 'pkg-a',
            analyzedBundle,
            resolveOptions
        });
    });

    test('buildChecksResult returns an Ok holding the resolved packages when no checks are configured', async function () {
        const resolvedPackages: readonly ResolvedPackage[] = [];

        const result = await buildChecksResult(unusedCheckDependencies, validated({}), resolvedPackages);

        if (!result.isOk) {
            assert.fail('expected checks result to succeed');
        }
        assert.strictEqual(result.value, resolvedPackages);
    });

    test('buildChecksResult returns a checks failure carrying every issue produced by a configured rule', async function () {
        const result = await buildChecksResult(
            unusedCheckDependencies,
            validated({
                checks: { noDuplicatedFiles: { enabled: true } },
                packages: [ packageConfig('pkg-a'), packageConfig('pkg-b') ]
            }),
            duplicateResolvedPackages()
        );

        if (!result.isErr) {
            assert.fail('expected checks result to fail');
        }
        assert.deepStrictEqual(result.error, {
            type: 'checks',
            issues: [ 'File "shared.ts" is included in multiple packages: pkg-a, pkg-b' ]
        });
    });

    test('buildChecksResult threads per-package check settings to the runner so cross-package consent suppresses issues', async function () {
        const consent = { noDuplicatedFiles: { allowList: [ 'shared.ts' ] } };

        const result = await buildChecksResult(
            unusedCheckDependencies,
            validated({
                checks: { noDuplicatedFiles: { enabled: true } },
                packages: [ packageConfig('pkg-a', { checks: consent }), packageConfig('pkg-b', { checks: consent }) ]
            }),
            duplicateResolvedPackages()
        );

        assert.strictEqual(result.isOk, true);
    });

    test('buildChecksResult falls back to commonPackageSettings.mainPackageJson when the package does not override it', async function () {
        const result = await runSinglePackageChecks(
            {
                commonPackageSettings: {
                    mainPackageJson: { type: 'module', dependencies: { 'runtime-dep': '1.0.0' } }
                },
                checks: { noDevDependencyImports: { enabled: true } },
                packages: [ packageConfig('pkg-a') ]
            },
            bundleWithExternal('pkg-a', 'runtime-dep')
        );

        assert.strictEqual(result.isOk, true);
    });

    test('buildChecksResult flags a dev-only import detected through the common mainPackageJson fallback', async function () {
        const result = await runSinglePackageChecks(
            {
                commonPackageSettings: {
                    mainPackageJson: { type: 'module', devDependencies: { 'dev-dep': '1.0.0' } }
                },
                checks: { noDevDependencyImports: { enabled: true } },
                packages: [ packageConfig('pkg-a') ]
            },
            bundleWithExternal('pkg-a', 'dev-dep')
        );

        if (!result.isErr) {
            assert.fail('expected checks result to fail');
        }
        assert.deepStrictEqual(result.error, {
            type: 'checks',
            issues: [
                'Package "pkg-a" imports "dev-dep" which is only declared in devDependencies of the main package.json'
            ]
        });
    });

    test('buildChecksResult prefers the package-level mainPackageJson over commonPackageSettings.mainPackageJson', async function () {
        const result = await runSinglePackageChecks(
            {
                commonPackageSettings: {
                    mainPackageJson: { type: 'module', devDependencies: { 'runtime-dep': '1.0.0' } }
                },
                checks: { noDevDependencyImports: { enabled: true } },
                packages: [
                    packageConfig('pkg-a', {
                        mainPackageJson: { type: 'module', dependencies: { 'runtime-dep': '1.0.0' } }
                    })
                ]
            },
            bundleWithExternal('pkg-a', 'runtime-dep')
        );

        assert.strictEqual(result.isOk, true);
    });

    test('buildChecksResult materializes generated packages when areTheTypesWrong is enabled', async function () {
        const analyzedBundle = checkBundle('pkg-a', [ 'index.js' ]);
        const addVersionCalls: unknown[] = [];
        const dependencies = {
            versionManager: {
                addVersion(options: unknown) {
                    addVersionCalls.push(options);
                    return createPublishedPackageWithManifest('pkg-a');
                }
            }
        };
        const result = await buildChecksResult(
            dependencies,
            validated({
                checks: { areTheTypesWrong: { enabled: true } },
                packages: [ packageConfig('pkg-a') ]
            }),
            [
                {
                    name: 'pkg-a',
                    analyzedBundle,
                    resolveOptions: {
                        ...createResolveOptions(),
                        mainPackageJson: { type: 'module' },
                        bundleDependencies: [ createLinkedBundle('bundle-dependency') ],
                        bundlePeerDependencies: [ createLinkedBundle('bundle-peer-dependency') ],
                        additionalPackageJsonAttributes: {},
                        allowMutableSpecifiers: []
                    }
                }
            ]
        );

        assert.strictEqual(result.isOk, true);
        assert.strictEqual(addVersionCalls.length, 1);
        assert.deepStrictEqual(addVersionCalls[0], {
            bundle: analyzedBundle,
            version: '0.0.0',
            mainPackageJson: { type: 'module' },
            bundleDependencies: [ { name: 'bundle-dependency', version: '0.0.0' } ],
            bundlePeerDependencies: [ { name: 'bundle-peer-dependency', version: '0.0.0' } ],
            additionalPackageJsonAttributes: {},
            allowMutableSpecifiers: []
        });
    });
});
