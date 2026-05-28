import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PublishedPackageWithManifest } from '../../published-package/published-package.ts';
import { checkBundle } from '../../test-libraries/check-bundle-fixture.ts';
import { areTheTypesWrongRule } from './are-the-types-wrong.ts';

function createPublishedPackage(
    packageName: string,
    files: Readonly<Record<string, string>>
): PublishedPackageWithManifest {
    const manifestContent = files['package.json'];
    if (manifestContent === undefined) {
        throw new Error(`package.json missing for ${packageName}`);
    }

    return {
        name: packageName,
        version: '0.0.0',
        manifestFile: {
            filePath: 'package.json',
            content: manifestContent,
            isExecutable: false
        },
        contents: Object.entries(files)
            .filter(([filePath]) => {
                return filePath !== 'package.json';
            })
            .map(([filePath, content]) => {
                return {
                    directDependencies: new Set<string>(),
                    fileDescription: {
                        sourceFilePath: filePath,
                        targetFilePath: filePath,
                        content,
                        isExecutable: false
                    },
                    isExplicitlyIncluded: false,
                    isSubstituted: false
                };
            })
    } as unknown as PublishedPackageWithManifest;
}

function createManifest(packageName: string): string {
    return JSON.stringify({
        name: packageName,
        version: '0.0.0',
        type: 'module',
        exports: {
            '.': {
                import: './index.js',
                types: './index.d.ts'
            }
        }
    });
}

function createTypedPackage(
    packageName: string,
    javascriptSource: string,
    declarationSource: string
): PublishedPackageWithManifest {
    return createPublishedPackage(packageName, {
        'package.json': createManifest(packageName),
        'index.js': javascriptSource,
        'index.d.ts': declarationSource
    });
}

function createEsmOnlyPackage(packageName: string): PublishedPackageWithManifest {
    return createTypedPackage(packageName, 'export const value = 1;\n', 'export declare const value: number;\n');
}

function createTwoEntrypointEsmPackage(packageName: string): PublishedPackageWithManifest {
    return createPublishedPackage(packageName, {
        'package.json': JSON.stringify({
            name: packageName,
            version: '0.0.0',
            type: 'module',
            exports: {
                '.': {
                    import: './index.js',
                    types: './index.d.ts'
                },
                './feature': {
                    import: './feature.js',
                    types: './feature.d.ts'
                }
            }
        }),
        'index.js': 'export const value = 1;\n',
        'index.d.ts': 'export declare const value: number;\n',
        'feature.js': 'export const feature = 1;\n',
        'feature.d.ts': 'export declare const feature: number;\n'
    });
}

function createBrokenPackage(packageName: string): PublishedPackageWithManifest {
    return createTypedPackage(
        packageName,
        'module.exports = function value() {};\nmodule.exports.default = module.exports;\n',
        'declare function value(): void;\nexport default value;\n'
    );
}

function createMixedEntrypointPackage(packageName: string): PublishedPackageWithManifest {
    return createPublishedPackage(packageName, {
        'package.json': JSON.stringify({
            name: packageName,
            version: '0.0.0',
            type: 'module',
            exports: {
                '.': {
                    import: './index.js',
                    types: './index.d.ts'
                },
                './feature': {
                    require: './feature.cjs',
                    types: './feature.d.ts'
                }
            }
        }),
        'index.js': 'module.exports = function value() {};\nmodule.exports.default = module.exports;\n',
        'index.d.ts': 'declare function value(): void;\nexport default value;\n',
        'feature.cjs': 'module.exports = function feature() {};\nmodule.exports.default = module.exports;\n',
        'feature.d.ts': 'declare function feature(): void;\nexport default feature;\n'
    });
}

function createUntypedPackage(packageName: string): PublishedPackageWithManifest {
    return createPublishedPackage(packageName, {
        'package.json': JSON.stringify({
            name: packageName,
            version: '0.0.0',
            type: 'module',
            exports: {
                '.': './index.js'
            }
        }),
        'index.js': 'export const value = 1;\n'
    });
}

async function runRule(
    packageName: string,
    publishedPackage: PublishedPackageWithManifest,
    settings: {
        readonly areTheTypesWrong: { readonly enabled: true; readonly profile?: 'esm-only' | 'node16' | 'strict' };
    },
    perPackageSettings: ReadonlyMap<
        string,
        { readonly areTheTypesWrong?: { readonly profile?: 'esm-only' | 'node16' | 'strict' } }
    > = new Map()
): Promise<readonly string[]> {
    return await areTheTypesWrongRule.run({
        bundles: [checkBundle(packageName, ['index.js', 'index.d.ts'])],
        publishedPackages: new Map([[packageName, publishedPackage]]),
        settings,
        perPackageSettings,
        packageConfigs: {}
    });
}

suite('are-the-types-wrong', function () {
    test('returns no issues when the rule is not configured', async function () {
        const packageName = 'not-configured-package';
        const issues = await areTheTypesWrongRule.run({
            bundles: [checkBundle(packageName, ['index.js', 'index.d.ts'])],
            settings: undefined,
            perPackageSettings: new Map(),
            packageConfigs: {}
        });

        assert.deepStrictEqual(issues, []);
    });

    test('returns no issues when the rule is disabled', async function () {
        const packageName = 'disabled-package';
        const issues = await areTheTypesWrongRule.run({
            bundles: [checkBundle(packageName, ['index.js', 'index.d.ts'])],
            settings: { areTheTypesWrong: { enabled: false } },
            perPackageSettings: new Map(),
            packageConfigs: {}
        });

        assert.deepStrictEqual(issues, []);
    });

    test('default esm-only profile ignores the expected CJS-only failure mode for a valid ESM package', async function () {
        const packageName = 'esm-only-package';
        const issues = await runRule(packageName, createEsmOnlyPackage(packageName), {
            areTheTypesWrong: { enabled: true }
        });

        assert.deepStrictEqual(issues, []);
    });

    test('strict profile reports the ESM-only CommonJS resolution problem', async function () {
        const packageName = 'strict-package';
        const issues = await runRule(packageName, createEsmOnlyPackage(packageName), {
            areTheTypesWrong: { enabled: true, profile: 'strict' }
        });

        assert.deepStrictEqual(issues, [
            'Package "strict-package" failed the Are the Types Wrong check: ESM (dynamic import only) affecting entrypoints "." in resolutions "node16-cjs"'
        ]);
    });

    test('node16 profile reports the CommonJS resolution problem for an ESM-only package', async function () {
        const packageName = 'node16-package';
        const issues = await runRule(packageName, createEsmOnlyPackage(packageName), {
            areTheTypesWrong: { enabled: true, profile: 'node16' }
        });

        assert.deepStrictEqual(issues, [
            'Package "node16-package" failed the Are the Types Wrong check: ESM (dynamic import only) affecting entrypoints "." in resolutions "node16-cjs"'
        ]);
    });

    test('groups repeated ATTW problem kinds into one finding summary', async function () {
        const packageName = 'strict-multi-entrypoint-package';
        const issues = await runRule(packageName, createTwoEntrypointEsmPackage(packageName), {
            areTheTypesWrong: { enabled: true, profile: 'strict' }
        });

        assert.deepStrictEqual(issues, [
            'Package "strict-multi-entrypoint-package" failed the Are the Types Wrong check: ESM (dynamic import only) (2 findings) affecting entrypoints ".", "./feature" in resolutions "node16-cjs"'
        ]);
    });

    test('per-package profile overrides the top-level profile', async function () {
        const packageName = 'override-package';
        const issues = await runRule(
            packageName,
            createEsmOnlyPackage(packageName),
            { areTheTypesWrong: { enabled: true } },
            new Map([[packageName, { areTheTypesWrong: { profile: 'strict' } }]])
        );

        assert.strictEqual(issues.length, 1);
        assert.match(issues[0] ?? '', /ESM \(dynamic import only\)/u);
    });

    test('returns no issues when the emitted package has no types', async function () {
        const packageName = 'untyped-package';
        const issues = await runRule(packageName, createUntypedPackage(packageName), {
            areTheTypesWrong: { enabled: true }
        });

        assert.deepStrictEqual(issues, []);
    });

    test('default esm-only profile still reports active ATTW problems for a broken package', async function () {
        const packageName = 'broken-package';
        const issues = await runRule(packageName, createBrokenPackage(packageName), {
            areTheTypesWrong: { enabled: true }
        });

        assert.ok(
            issues.some((issue) => {
                return issue.includes('Missing `export =`');
            })
        );
        assert.ok(
            issues.some((issue) => {
                return issue.includes('Unexpected module syntax');
            })
        );
        assert.ok(
            issues.every((issue) => {
                return !issue.includes('ESM (dynamic import only)');
            })
        );
    });

    test('strict profile preserves all relevant resolution kinds for a broken package', async function () {
        const packageName = 'strict-broken-package';
        const issues = await runRule(packageName, createBrokenPackage(packageName), {
            areTheTypesWrong: { enabled: true, profile: 'strict' }
        });

        assert.deepStrictEqual(issues, [
            'Package "strict-broken-package" failed the Are the Types Wrong check: Missing `export =` affecting entrypoints "." in resolutions "node10", "bundler"',
            'Package "strict-broken-package" failed the Are the Types Wrong check: ESM (dynamic import only) affecting entrypoints "." in resolutions "node16-cjs"',
            'Package "strict-broken-package" failed the Are the Types Wrong check: Unexpected module syntax affecting entrypoints "." in resolutions "node16-esm"'
        ]);
    });

    test('lists only the entrypoints affected by each ATTW problem kind', async function () {
        const packageName = 'mixed-entrypoint-package';
        const issues = await runRule(packageName, createMixedEntrypointPackage(packageName), {
            areTheTypesWrong: { enabled: true, profile: 'strict' }
        });

        assert.deepStrictEqual(issues, [
            'Package "mixed-entrypoint-package" failed the Are the Types Wrong check: Missing `export =` affecting entrypoints "." in resolutions "node10", "bundler"',
            'Package "mixed-entrypoint-package" failed the Are the Types Wrong check: ESM (dynamic import only) affecting entrypoints "." in resolutions "node16-cjs"',
            'Package "mixed-entrypoint-package" failed the Are the Types Wrong check: Unexpected module syntax affecting entrypoints "." in resolutions "node16-esm"',
            'Package "mixed-entrypoint-package" failed the Are the Types Wrong check: Used fallback condition affecting entrypoints "./feature" in resolutions "node16-cjs"',
            'Package "mixed-entrypoint-package" failed the Are the Types Wrong check: Masquerading as ESM affecting entrypoints "./feature" in resolutions "node16-cjs"'
        ]);
    });

    test('returns a check issue when ATTW cannot find the generated package manifest', async function () {
        const packageName = 'throwing-package';
        const publishedPackage = {
            ...createEsmOnlyPackage(packageName),
            manifestFile: {
                filePath: 'manifest.json',
                content: createManifest(packageName),
                isExecutable: false
            }
        };
        const issues = await runRule(packageName, publishedPackage, {
            areTheTypesWrong: { enabled: true }
        });

        assert.deepStrictEqual(issues, [
            'Package "throwing-package" failed the Are the Types Wrong check: Error: File not found: /node_modules/throwing-package/package.json'
        ]);
    });

    test('throws when the rule is enabled but the emitted package is missing', async function () {
        await assert.rejects(async () => {
            await areTheTypesWrongRule.run({
                bundles: [checkBundle('missing-package', ['index.js'])],
                settings: { areTheTypesWrong: { enabled: true } },
                perPackageSettings: new Map(),
                packageConfigs: {}
            });
        }, /Published package missing/u);
    });
});
