import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import type { ExternalDependency } from '../../dependency-scanner/external-dependencies.ts';
import { analyzedBundle } from '../../test-libraries/bundle-fixtures.ts';
import { noUnusedBundleDependenciesRule } from './no-unused-bundle-dependencies.ts';

function bundleWithLinkedDeps(name: string, linked: readonly string[]): AnalyzedBundle {
    return analyzedBundle({
        name,
        linkedBundleDependencies: new Map<string, ExternalDependency>(
            linked.map(function (dependencyName) {
                return [ dependencyName, { name: dependencyName, referencedFrom: [ `/${name}/index.js` ] } ];
            })
        )
    });
}

const enabled = { noUnusedBundleDependencies: { enabled: true } };

suite('no-unused-bundle-dependencies', function () {
    suite('disabled and missing package data', function () {
        test('rule definition exposes name, schemas and a run function', function () {
            assert.strictEqual(noUnusedBundleDependenciesRule.name, 'noUnusedBundleDependencies');
            assert.strictEqual(typeof noUnusedBundleDependenciesRule.run, 'function');
        });

        test('returns no issues when settings are missing', async function () {
            const result = await noUnusedBundleDependenciesRule.run({
                bundles: [ bundleWithLinkedDeps('a', []) ],
                settings: undefined,
                perPackageSettings: new Map(),
                packageConfigs: { a: { bundleDependencies: [ 'unused' ] } }
            });

            assert.deepStrictEqual(result, []);
        });

        test('returns no issues when the rule is disabled', async function () {
            const result = await noUnusedBundleDependenciesRule.run({
                bundles: [ bundleWithLinkedDeps('a', []) ],
                settings: { noUnusedBundleDependencies: { enabled: false } },
                perPackageSettings: new Map(),
                packageConfigs: { a: { bundleDependencies: [ 'unused' ] } }
            });

            assert.deepStrictEqual(result, []);
        });

        test('returns no issues when packageConfigs is omitted entirely', async function () {
            const result = await noUnusedBundleDependenciesRule.run({
                bundles: [ bundleWithLinkedDeps('a', []) ],
                settings: enabled,
                perPackageSettings: new Map()
            });

            assert.deepStrictEqual(result, []);
        });

        test('returns no issues when no entry exists in packageConfigs for the bundle', async function () {
            const result = await noUnusedBundleDependenciesRule.run({
                bundles: [ bundleWithLinkedDeps('a', []) ],
                settings: enabled,
                perPackageSettings: new Map(),
                packageConfigs: {}
            });

            assert.deepStrictEqual(result, []);
        });

        test('returns no issues when the package declares no bundle dependencies', async function () {
            const result = await noUnusedBundleDependenciesRule.run({
                bundles: [ bundleWithLinkedDeps('a', []) ],
                settings: enabled,
                perPackageSettings: new Map(),
                packageConfigs: { a: {} }
            });

            assert.deepStrictEqual(result, []);
        });
    });

    suite('declared dependency usage', function () {
        test('reports a declared bundleDependency that is never substituted', async function () {
            const result = await noUnusedBundleDependenciesRule.run({
                bundles: [ bundleWithLinkedDeps('a', []) ],
                settings: enabled,
                perPackageSettings: new Map(),
                packageConfigs: { a: { bundleDependencies: [ 'unused' ] } }
            });

            assert.deepStrictEqual(result, [ 'Unused bundle dependency "unused" declared by package "a"' ]);
        });

        test('reports a declared bundlePeerDependency that is never substituted', async function () {
            const result = await noUnusedBundleDependenciesRule.run({
                bundles: [ bundleWithLinkedDeps('a', []) ],
                settings: enabled,
                perPackageSettings: new Map(),
                packageConfigs: { a: { bundlePeerDependencies: [ 'unused-peer' ] } }
            });

            assert.deepStrictEqual(result, [ 'Unused bundle peer dependency "unused-peer" declared by package "a"' ]);
        });

        test('does not report a declared bundleDependency that was substituted', async function () {
            const result = await noUnusedBundleDependenciesRule.run({
                bundles: [ bundleWithLinkedDeps('a', [ 'used' ]) ],
                settings: enabled,
                perPackageSettings: new Map(),
                packageConfigs: { a: { bundleDependencies: [ 'used' ] } }
            });

            assert.deepStrictEqual(result, []);
        });

        test('reports a mix of unused regular and peer dependencies for the same package', async function () {
            const result = await noUnusedBundleDependenciesRule.run({
                bundles: [ bundleWithLinkedDeps('a', [ 'used' ]) ],
                settings: enabled,
                perPackageSettings: new Map(),
                packageConfigs: {
                    a: { bundleDependencies: [ 'used', 'orphan' ], bundlePeerDependencies: [ 'orphan-peer' ] }
                }
            });

            assert.deepStrictEqual(result, [
                'Unused bundle dependency "orphan" declared by package "a"',
                'Unused bundle peer dependency "orphan-peer" declared by package "a"'
            ]);
        });

        test('iterates every bundle independently', async function () {
            const result = await noUnusedBundleDependenciesRule.run({
                bundles: [ bundleWithLinkedDeps('a', []), bundleWithLinkedDeps('b', [ 'used' ]) ],
                settings: enabled,
                perPackageSettings: new Map(),
                packageConfigs: {
                    a: { bundleDependencies: [ 'unused-a' ] },
                    b: { bundleDependencies: [ 'used' ] }
                }
            });

            assert.deepStrictEqual(result, [ 'Unused bundle dependency "unused-a" declared by package "a"' ]);
        });
    });
});
