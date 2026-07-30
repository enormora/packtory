import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PublishedPackageWithManifest } from '../../published-package/published-package.ts';
import { checkBundle } from '../../test-libraries/check-bundle-fixture.ts';
import { typeScriptIntegrityRule } from './type-script-integrity.ts';

const packageCheckTestTimeoutMs = 60_000;

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
        contents: Object
            .entries(files)
            .filter(function ([ filePath ]) {
                return filePath !== 'package.json';
            })
            .map(function ([ filePath, content ]) {
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

function createBrokenPackage(packageName: string): PublishedPackageWithManifest {
    return createTypedPackage(
        packageName,
        'module.exports = function value() {};\nmodule.exports.default = module.exports;\n',
        'declare function value(): void;\nexport default value;\n'
    );
}

type EntrypointSources = {
    readonly javascriptSource: string;
    readonly declarationSource: string;
};

function createTwoEntrypointPackage(
    packageName: string,
    rootEntrypoint: EntrypointSources,
    featureEntrypoint: EntrypointSources
): PublishedPackageWithManifest {
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
        'index.js': rootEntrypoint.javascriptSource,
        'index.d.ts': rootEntrypoint.declarationSource,
        'feature.js': featureEntrypoint.javascriptSource,
        'feature.d.ts': featureEntrypoint.declarationSource
    });
}

const brokenCommonJsEntrypoint: EntrypointSources = {
    javascriptSource: 'module.exports = function value() {};\nmodule.exports.default = module.exports;\n',
    declarationSource: 'declare function value(): void;\nexport default value;\n'
};

function createTwoEntrypointBrokenPackage(packageName: string): PublishedPackageWithManifest {
    return createTwoEntrypointPackage(packageName, brokenCommonJsEntrypoint, {
        javascriptSource: 'module.exports = function feature() {};\nmodule.exports.default = module.exports;\n',
        declarationSource: 'declare function feature(): void;\nexport default feature;\n'
    });
}

function createMixedEntrypointPackage(packageName: string): PublishedPackageWithManifest {
    return createTwoEntrypointPackage(packageName, brokenCommonJsEntrypoint, {
        javascriptSource: 'export const feature = 1;\n',
        declarationSource: 'export declare const feature: number;\n'
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

function createTs2305Package(packageName: string): PublishedPackageWithManifest {
    return createPublishedPackage(packageName, {
        'package.json': createManifest(packageName),
        'index.js': 'export const value = 1;\n',
        'index.d.ts': 'import { Missing } from "./internal.js";\nexport declare const value: Missing;\n',
        'internal.d.ts': 'export declare const present: string;\n'
    });
}

function createPrivateBrokenDeclarationPackage(packageName: string): PublishedPackageWithManifest {
    return createPublishedPackage(packageName, {
        'package.json': createManifest(packageName),
        'index.js': 'export const value = 1;\n',
        'index.d.ts': 'export declare const value: number;\n',
        'private.d.ts': 'import { Missing } from "./internal.js";\nexport declare const value: Missing;\n',
        'internal.d.ts': 'export declare const present: string;\n'
    });
}

type TypeScriptIntegritySettings = {
    readonly typeScriptIntegrity: {
        readonly enabled: boolean;
        readonly declarations?: 'all' | 'exports-graph';
    };
};

async function runRule(
    packageName: string,
    publishedPackage: PublishedPackageWithManifest,
    settings: TypeScriptIntegritySettings | undefined
): Promise<readonly string[]> {
    return await typeScriptIntegrityRule.run({
        bundles: [ checkBundle(packageName, [ 'index.js', 'index.d.ts' ]) ],
        publishedPackages: new Map([ [ packageName, publishedPackage ] ]),
        settings,
        perPackageSettings: new Map(),
        packageConfigs: {}
    });
}

suite('type-script-integrity', function () {
    suite('disabled states', function () {
        test('returns no issues when the rule is not configured', async function () {
            const packageName = 'not-configured-package';
            const issues = await typeScriptIntegrityRule.run({
                bundles: [ checkBundle(packageName, [ 'index.js', 'index.d.ts' ]) ],
                settings: undefined,
                perPackageSettings: new Map(),
                packageConfigs: {}
            });

            assert.deepStrictEqual(issues, []);
        })
            .timeout(packageCheckTestTimeoutMs);

        test('returns no issues when the rule is disabled', async function () {
            const packageName = 'disabled-package';
            const issues = await runRule(packageName, createEsmOnlyPackage(packageName), {
                typeScriptIntegrity: { enabled: false }
            });

            assert.deepStrictEqual(issues, []);
        })
            .timeout(packageCheckTestTimeoutMs);
    });

    suite('package resolution', function () {
        test('ignores the expected CommonJS-only failure mode for a valid ESM package', async function () {
            const packageName = 'esm-only-package';
            const issues = await runRule(packageName, createEsmOnlyPackage(packageName), {
                typeScriptIntegrity: { enabled: true }
            });

            assert.deepStrictEqual(issues, []);
        })
            .timeout(packageCheckTestTimeoutMs);

        test('groups repeated package-resolution problem kinds into one finding summary', async function () {
            const packageName = 'multi-entrypoint-package';
            const issues = await runRule(packageName, createTwoEntrypointBrokenPackage(packageName), {
                typeScriptIntegrity: { enabled: true }
            });

            assert.deepStrictEqual(issues, [
                'Package "multi-entrypoint-package" failed TypeScript integrity: Missing `export =` (2 findings) affecting entrypoints ".", "./feature" in resolutions "bundler"',
                'Package "multi-entrypoint-package" failed TypeScript integrity: Unexpected module syntax (2 findings) affecting entrypoints ".", "./feature" in resolutions "node16-esm"'
            ]);
        })
            .timeout(packageCheckTestTimeoutMs);

        test('reports only entrypoints affected by a package-resolution problem', async function () {
            const packageName = 'mixed-entrypoint-package';
            const issues = await runRule(packageName, createMixedEntrypointPackage(packageName), {
                typeScriptIntegrity: { enabled: true }
            });

            assert.deepStrictEqual(issues, [
                'Package "mixed-entrypoint-package" failed TypeScript integrity: Missing `export =` affecting entrypoints "." in resolutions "bundler"',
                'Package "mixed-entrypoint-package" failed TypeScript integrity: Unexpected module syntax affecting entrypoints "." in resolutions "node16-esm"'
            ]);
        })
            .timeout(packageCheckTestTimeoutMs);

        test('returns an issue when the emitted package has no types', async function () {
            const packageName = 'untyped-package';
            const issues = await runRule(packageName, createUntypedPackage(packageName), {
                typeScriptIntegrity: { enabled: true }
            });

            assert.deepStrictEqual(issues, [ 'Package "untyped-package" does not expose TypeScript declarations' ]);
        })
            .timeout(packageCheckTestTimeoutMs);

        test('reports package-resolution problems without exposing the internal checker name', async function () {
            const packageName = 'broken-package';
            const issues = await runRule(packageName, createBrokenPackage(packageName), {
                typeScriptIntegrity: { enabled: true }
            });

            assert.deepStrictEqual(issues, [
                'Package "broken-package" failed TypeScript integrity: Missing `export =` affecting entrypoints "." in resolutions "bundler"',
                'Package "broken-package" failed TypeScript integrity: Unexpected module syntax affecting entrypoints "." in resolutions "node16-esm"'
            ]);
            assert.ok(
                issues.every(function (issue) {
                    return !issue.includes('Are the Types Wrong');
                })
            );
        })
            .timeout(packageCheckTestTimeoutMs);

        test('returns a check issue when the generated package manifest is missing', async function () {
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
                typeScriptIntegrity: { enabled: true }
            });

            assert.deepStrictEqual(issues, [
                'Package "throwing-package" failed TypeScript integrity: Error: File not found: /node_modules/throwing-package/package.json'
            ]);
        })
            .timeout(packageCheckTestTimeoutMs);

        test('throws when the rule is enabled but the emitted package is missing', async function () {
            await assert.rejects(async function () {
                await typeScriptIntegrityRule.run({
                    bundles: [ checkBundle('missing-package', [ 'index.js' ]) ],
                    settings: { typeScriptIntegrity: { enabled: true } },
                    perPackageSettings: new Map(),
                    packageConfigs: {}
                });
            }, /Published package missing/u);
        });
    });

    suite('declaration integrity', function () {
        test('reports missing exports in reachable declarations', async function () {
            const packageName = 'ts2305-package';
            const issues = await runRule(packageName, createTs2305Package(packageName), {
                typeScriptIntegrity: { enabled: true }
            });

            assert.deepStrictEqual(issues, [
                'Package "ts2305-package" failed TypeScript integrity in node16-esm: index.d.ts:1 TS2305: Module \'"./internal.js"\' has no exported member \'Missing\'.',
                'Package "ts2305-package" failed TypeScript integrity in bundler: index.d.ts:1 TS2305: Module \'"./internal.js"\' has no exported member \'Missing\'.'
            ]);
        })
            .timeout(packageCheckTestTimeoutMs);

        test('checks every packaged declaration by default', async function () {
            const packageName = 'private-broken-package';
            const issues = await runRule(packageName, createPrivateBrokenDeclarationPackage(packageName), {
                typeScriptIntegrity: { enabled: true }
            });

            assert.deepStrictEqual(issues, [
                'Package "private-broken-package" failed TypeScript integrity in node16-esm: private.d.ts:1 TS2305: Module \'"./internal.js"\' has no exported member \'Missing\'.',
                'Package "private-broken-package" failed TypeScript integrity in bundler: private.d.ts:1 TS2305: Module \'"./internal.js"\' has no exported member \'Missing\'.'
            ]);
        })
            .timeout(packageCheckTestTimeoutMs);

        test('exports-graph declarations mode ignores unreachable private declarations', async function () {
            const packageName = 'private-broken-package';
            const issues = await runRule(packageName, createPrivateBrokenDeclarationPackage(packageName), {
                typeScriptIntegrity: { enabled: true, declarations: 'exports-graph' }
            });

            assert.deepStrictEqual(issues, []);
        })
            .timeout(packageCheckTestTimeoutMs);
    });
});
