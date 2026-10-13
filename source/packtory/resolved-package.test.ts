import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PackageConfiguration, PacktoryConfigurationWithoutRegistry } from '../configuration/configuration.ts';
import type { ValidConfigurationWithoutRegistryResult } from '../configuration/validation.ts';
import { checkBundle, fakeCheckRunner } from '../test-libraries/check-fixtures.ts';
import { analyzedBundleResource, versionedBundleWithManifest } from '../test-libraries/bundle-fixtures.ts';
import { validConfigurationWithoutRegistryFixture } from '../test-libraries/configuration-fixtures.ts';
import { createLinkedBundle, createResolveOptions } from '../test-libraries/package-processor-test-support.ts';
import type { BuildVersionedBundleOptions, VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import {
    buildChecksResult,
    createResolvedPackage,
    type CheckEvaluationDependencies,
    type ResolvedPackage
} from './resolved-package.ts';

const validated: (
    configuration: Partial<PacktoryConfigurationWithoutRegistry>
) => ValidConfigurationWithoutRegistryResult = validConfigurationWithoutRegistryFixture;

const unusedCheckDependencies = {
    runChecks: fakeCheckRunner(),
    versionManager: {
        addVersion() {
            throw new Error('versionManager.addVersion should not run for checks that do not need generated packages');
        }
    }
};

function packageConfiguration(
    name: string,
    overrides: Partial<PackageConfiguration> = {}
): PacktoryConfigurationWithoutRegistry['packages'][number] {
    return { name, roots: {}, ...overrides };
}

function resolvedPackage(name: string, analyzedBundle: ResolvedPackage['analyzedBundle']): ResolvedPackage {
    return { name, analyzedBundle, resolveOptions: createResolveOptions() };
}

function duplicateResolvedPackages(): readonly ResolvedPackage[] {
    return [
        resolvedPackage('package-a', checkBundle('package-a', [ 'shared.ts' ])),
        resolvedPackage('package-b', checkBundle('package-b', [ 'shared.ts' ]))
    ];
}

function bundleWithExternal(packageName: string, dependencyName: string): ResolvedPackage['analyzedBundle'] {
    return {
        ...checkBundle(packageName, [ 'shared.ts' ]),
        externalDependencies: new Map([ [ dependencyName, { name: dependencyName, referencedFrom: [ '/x' ] } ] ])
    };
}

async function runSinglePackageChecks(
    configuration: Partial<PacktoryConfigurationWithoutRegistry>,
    analyzedBundle: ResolvedPackage['analyzedBundle']
): Promise<Awaited<ReturnType<typeof buildChecksResult>>> {
    return await buildChecksResult(unusedCheckDependencies, validated(configuration), [
        resolvedPackage('package-a', analyzedBundle)
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
            inputFilePath: 'index.js',
            targetFilePath: 'index.js',
            content: 'export const value = 1;\n'
        },
        typesMainFile: {
            inputFilePath: 'index.d.ts',
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
        packageManifest: {
            name: packageName,
            version: '0.0.0'
        }
    });
}

type RecordedPublishedPackageInputs = {
    readonly addVersionCalls: readonly BuildVersionedBundleOptions[];
    readonly dependencies: CheckEvaluationDependencies;
};

function recordPublishedPackageInputs(packageName: string): RecordedPublishedPackageInputs {
    const addVersionCalls: BuildVersionedBundleOptions[] = [];
    return {
        addVersionCalls,
        dependencies: {
            runChecks: fakeCheckRunner(),
            versionManager: {
                addVersion(options: BuildVersionedBundleOptions) {
                    addVersionCalls.push(options);
                    return createPublishedPackageWithManifest(packageName);
                }
            }
        }
    };
}

suite('resolved-package', function () {
    test('createResolvedPackage assembles the three fields into a ResolvedPackage', function () {
        const analyzedBundle = checkBundle('package-a', []);
        const resolveOptions = createResolveOptions();

        assert.deepStrictEqual(createResolvedPackage('package-a', analyzedBundle, resolveOptions), {
            name: 'package-a',
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
                packages: [ packageConfiguration('package-a'), packageConfiguration('package-b') ]
            }),
            duplicateResolvedPackages()
        );

        if (!result.isErr) {
            assert.fail('expected checks result to fail');
        }
        assert.deepStrictEqual(result.error, {
            type: 'checks',
            issues: [ 'File "shared.ts" is included in multiple packages: package-a, package-b' ]
        });
    });

    test('buildChecksResult threads per-package check settings to the runner so cross-package consent suppresses issues', async function () {
        const consent = { noDuplicatedFiles: { allowList: [ 'shared.ts' ] } };

        const result = await buildChecksResult(
            unusedCheckDependencies,
            validated({
                checks: { noDuplicatedFiles: { enabled: true } },
                packages: [
                    packageConfiguration('package-a', { checks: consent }),
                    packageConfiguration('package-b', { checks: consent })
                ]
            }),
            duplicateResolvedPackages()
        );

        assert.strictEqual(result.isOk, true);
    });

    test('buildChecksResult falls back to commonPackageSettings.mainPackageManifest when the package does not override it', async function () {
        const result = await runSinglePackageChecks(
            {
                commonPackageSettings: {
                    mainPackageManifest: { type: 'module', dependencies: { 'runtime-dep': '1.0.0' } }
                },
                checks: { noDevelopmentDependencyImports: { enabled: true } },
                packages: [ packageConfiguration('package-a') ]
            },
            bundleWithExternal('package-a', 'runtime-dep')
        );

        assert.strictEqual(result.isOk, true);
    });

    test('buildChecksResult flags a dev-only import detected through the common mainPackageManifest fallback', async function () {
        const result = await runSinglePackageChecks(
            {
                commonPackageSettings: {
                    mainPackageManifest: { type: 'module', devDependencies: { 'dev-dep': '1.0.0' } }
                },
                checks: { noDevelopmentDependencyImports: { enabled: true } },
                packages: [ packageConfiguration('package-a') ]
            },
            bundleWithExternal('package-a', 'dev-dep')
        );

        if (!result.isErr) {
            assert.fail('expected checks result to fail');
        }
        assert.deepStrictEqual(result.error, {
            type: 'checks',
            issues: [
                'Package "package-a" imports "dev-dep" which is only declared in devDependencies of the main package.json'
            ]
        });
    });

    test('buildChecksResult prefers the package-level mainPackageManifest over commonPackageSettings.mainPackageManifest', async function () {
        const result = await runSinglePackageChecks(
            {
                commonPackageSettings: {
                    mainPackageManifest: { type: 'module', devDependencies: { 'runtime-dep': '1.0.0' } }
                },
                checks: { noDevelopmentDependencyImports: { enabled: true } },
                packages: [
                    packageConfiguration('package-a', {
                        mainPackageManifest: { type: 'module', dependencies: { 'runtime-dep': '1.0.0' } }
                    })
                ]
            },
            bundleWithExternal('package-a', 'runtime-dep')
        );

        assert.strictEqual(result.isOk, true);
    });

    suite('generated check packages', function () {
        test('buildChecksResult materializes generated packages when typeScriptIntegrity is enabled', async function () {
            const analyzedBundle = checkBundle('package-a', [ 'index.js' ]);
            const { addVersionCalls, dependencies } = recordPublishedPackageInputs('package-a');
            const result = await buildChecksResult(
                dependencies,
                validated({
                    checks: { typeScriptIntegrity: { enabled: true } },
                    packages: [ packageConfiguration('package-a') ]
                }),
                [
                    {
                        name: 'package-a',
                        analyzedBundle,
                        resolveOptions: {
                            ...createResolveOptions(),
                            mainPackageManifest: { type: 'module' },
                            bundleDependencies: [ createLinkedBundle('bundle-dependency') ],
                            bundlePeerDependencies: [ createLinkedBundle('bundle-peer-dependency') ],
                            additionalPackageManifestAttributes: {},
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
                mainPackageManifest: { type: 'module' },
                bundleDependencies: [ { name: 'bundle-dependency', version: '0.0.0' } ],
                bundlePeerDependencies: [ { name: 'bundle-peer-dependency', version: '0.0.0' } ],
                additionalPackageManifestAttributes: {},
                allowMutableSpecifiers: []
            });
        });

        test('buildChecksResult materializes generated packages when noUnexposedExecutables is enabled', async function () {
            const analyzedBundle = checkBundle('package-a', [ 'index.js' ]);
            const { addVersionCalls, dependencies } = recordPublishedPackageInputs('package-a');
            const result = await buildChecksResult(
                dependencies,
                validated({
                    checks: { noUnexposedExecutables: { enabled: true } },
                    packages: [ packageConfiguration('package-a') ]
                }),
                [
                    {
                        name: 'package-a',
                        analyzedBundle,
                        resolveOptions: {
                            ...createResolveOptions(),
                            mainPackageManifest: { type: 'module' },
                            bundleDependencies: [],
                            bundlePeerDependencies: [],
                            additionalPackageManifestAttributes: {},
                            allowMutableSpecifiers: []
                        }
                    }
                ]
            );

            assert.strictEqual(result.isOk, true);
            assert.strictEqual(addVersionCalls.length, 1);
        });
    });

    test('buildChecksResult reports generated package errors as check issues', async function () {
        const result = await buildChecksResult(
            {
                runChecks: fakeCheckRunner(),
                versionManager: {
                    addVersion() {
                        throw new Error('Package "package-a" exposes substituted module "./internal.js"');
                    }
                }
            },
            validated({
                checks: { typeScriptIntegrity: { enabled: true } },
                packages: [ packageConfiguration('package-a') ]
            }),
            [ resolvedPackage('package-a', checkBundle('package-a', [ 'index.js' ])) ]
        );

        if (!result.isErr) {
            assert.fail('expected checks result to fail');
        }
        assert.deepStrictEqual(result.error, {
            type: 'checks',
            issues: [ 'Package "package-a" exposes substituted module "./internal.js"' ]
        });
    });

    test('buildChecksResult includes substitution public module usage in generated check packages', async function () {
        const packageBundle = checkBundle('package-a', [ 'index.js', 'lib/internal.js' ]);
        const consumerBundle = checkBundle('package-b', [ 'index.js' ]);
        const { addVersionCalls, dependencies } = recordPublishedPackageInputs('package-a');
        const result = await buildChecksResult(
            dependencies,
            validated({
                checks: { typeScriptIntegrity: { enabled: true } },
                packages: [ packageConfiguration('package-a'), packageConfiguration('package-b') ]
            }),
            [
                {
                    name: 'package-a',
                    analyzedBundle: packageBundle,
                    resolveOptions: {
                        ...createResolveOptions(),
                        mainPackageManifest: { type: 'module' },
                        bundleDependencies: [],
                        bundlePeerDependencies: [],
                        additionalPackageManifestAttributes: {},
                        allowMutableSpecifiers: []
                    }
                },
                resolvedPackage('package-b', {
                    ...consumerBundle,
                    contents: [
                        analyzedBundleResource('index.js', {
                            content: 'import "package-a/lib/internal.js";\n',
                            targetFilePath: 'index.js'
                        })
                    ]
                })
            ]
        );

        assert.strictEqual(result.isOk, true);
        assert.strictEqual(addVersionCalls.length, 2);
        assert.deepStrictEqual(addVersionCalls[0], {
            bundle: packageBundle,
            version: '0.0.0',
            mainPackageManifest: { type: 'module' },
            bundleDependencies: [],
            bundlePeerDependencies: [],
            additionalPackageManifestAttributes: {},
            allowMutableSpecifiers: [],
            substitutionPublicModuleSourcePaths: new Set([ 'lib/internal.js' ])
        });
    });
});
