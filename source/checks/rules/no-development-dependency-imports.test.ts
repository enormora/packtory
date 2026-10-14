import assert from 'node:assert';
import { suite, test } from 'mocha';
import { emptyCheckContext } from '../../test-libraries/check-fixtures.ts';
import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import type { ExternalDependency } from '../../dependency-scanner/external-dependencies.ts';
import { analyzedBundle } from '../../test-libraries/bundle-fixtures.ts';
import { noDevelopmentDependencyImportsRule } from './no-development-dependency-imports.ts';

function bundleWithExternals(name: string, externals: readonly string[]): AnalyzedBundle {
    return analyzedBundle({
        name,
        externalDependencies: new Map<string, ExternalDependency>(
            externals.map(function (dependencyName) {
                return [ dependencyName, { name: dependencyName, referencedFrom: [ `/${name}/index.js` ] } ];
            })
        )
    });
}

const enabled = { noDevelopmentDependencyImports: { enabled: true } };

suite('no-dev-dependency-imports', function () {
    suite('disabled and missing package data', function () {
        test('rule definition exposes name, schemas and a run function', function () {
            assert.strictEqual(noDevelopmentDependencyImportsRule.name, 'noDevelopmentDependencyImports');
            assert.strictEqual(typeof noDevelopmentDependencyImportsRule.run, 'function');
        });

        test('returns no issues when settings are missing', async function () {
            const result = await noDevelopmentDependencyImportsRule.run({
                bundles: [ bundleWithExternals('a', [ 'leaked' ]) ],
                settings: undefined,
                ...emptyCheckContext(),
                packageConfigurations: { a: { mainPackageManifest: { devDependencies: { leaked: '1.0.0' } } } }
            });

            assert.deepStrictEqual(result, []);
        });

        test('returns no issues when the rule is disabled', async function () {
            const result = await noDevelopmentDependencyImportsRule.run({
                bundles: [ bundleWithExternals('a', [ 'leaked' ]) ],
                settings: { noDevelopmentDependencyImports: { enabled: false } },
                ...emptyCheckContext(),
                packageConfigurations: { a: { mainPackageManifest: { devDependencies: { leaked: '1.0.0' } } } }
            });

            assert.deepStrictEqual(result, []);
        });

        test('returns no issues when packageConfigurations is omitted entirely', async function () {
            const result = await noDevelopmentDependencyImportsRule.run({
                bundles: [ bundleWithExternals('a', [ 'leaked' ]) ],
                settings: enabled,
                ...emptyCheckContext()
            });

            assert.deepStrictEqual(result, []);
        });

        test('returns no issues when packageConfigurations has no entry for the bundle', async function () {
            const result = await noDevelopmentDependencyImportsRule.run({
                bundles: [ bundleWithExternals('a', [ 'leaked' ]) ],
                settings: enabled,
                ...emptyCheckContext(),
                packageConfigurations: {}
            });

            assert.deepStrictEqual(result, []);
        });

        test('returns no issues when the package has no main package.json', async function () {
            const result = await noDevelopmentDependencyImportsRule.run({
                bundles: [ bundleWithExternals('a', [ 'leaked' ]) ],
                settings: enabled,
                ...emptyCheckContext(),
                packageConfigurations: { a: {} }
            });

            assert.deepStrictEqual(result, []);
        });
    });

    suite('dependency classification', function () {
        test('reports an external dependency that is only declared in devDependencies', async function () {
            const result = await noDevelopmentDependencyImportsRule.run({
                bundles: [ bundleWithExternals('a', [ 'leaked' ]) ],
                settings: enabled,
                ...emptyCheckContext(),
                packageConfigurations: { a: { mainPackageManifest: { devDependencies: { leaked: '1.0.0' } } } }
            });

            assert.deepStrictEqual(result, [
                'Package "a" imports "leaked" which is only declared in devDependencies of the main package.json'
            ]);
        });

        test('does not report when the dependency is also declared in dependencies', async function () {
            const result = await noDevelopmentDependencyImportsRule.run({
                bundles: [ bundleWithExternals('a', [ 'shared' ]) ],
                settings: enabled,
                ...emptyCheckContext(),
                packageConfigurations: {
                    a: {
                        mainPackageManifest: {
                            dependencies: { shared: '1.0.0' },
                            devDependencies: { shared: '1.0.0' }
                        }
                    }
                }
            });

            assert.deepStrictEqual(result, []);
        });

        test('does not report when the dependency is declared in peerDependencies', async function () {
            const result = await noDevelopmentDependencyImportsRule.run({
                bundles: [ bundleWithExternals('a', [ 'peer' ]) ],
                settings: enabled,
                ...emptyCheckContext(),
                packageConfigurations: {
                    a: {
                        mainPackageManifest: {
                            peerDependencies: { peer: '1.0.0' },
                            devDependencies: { peer: '1.0.0' }
                        }
                    }
                }
            });

            assert.deepStrictEqual(result, []);
        });

        test('does not report when the dependency is not in any list', async function () {
            const result = await noDevelopmentDependencyImportsRule.run({
                bundles: [ bundleWithExternals('a', [ 'unknown' ]) ],
                settings: enabled,
                ...emptyCheckContext(),
                packageConfigurations: { a: { mainPackageManifest: {} } }
            });

            assert.deepStrictEqual(result, []);
        });

        test('reports independently per bundle', async function () {
            const result = await noDevelopmentDependencyImportsRule.run({
                bundles: [ bundleWithExternals('a', [ 'leak-a' ]), bundleWithExternals('b', [ 'fine' ]) ],
                settings: enabled,
                ...emptyCheckContext(),
                packageConfigurations: {
                    a: { mainPackageManifest: { devDependencies: { 'leak-a': '1.0.0' } } },
                    b: { mainPackageManifest: { dependencies: { fine: '1.0.0' } } }
                }
            });

            assert.deepStrictEqual(result, [
                'Package "a" imports "leak-a" which is only declared in devDependencies of the main package.json'
            ]);
        });
    });
});
