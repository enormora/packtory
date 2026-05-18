import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import type { ExternalDependency } from '../../dependency-scanner/external-dependencies.ts';
import { analyzedBundle } from '../../test-libraries/bundle-fixtures.ts';
import { noDevDependencyImportsRule } from './no-dev-dependency-imports.ts';

function bundleWithExternals(name: string, externals: readonly string[]): AnalyzedBundle {
    return analyzedBundle({
        name,
        externalDependencies: new Map<string, ExternalDependency>(
            externals.map((dep) => {
                return [dep, { name: dep, referencedFrom: [`/${name}/index.js`] }];
            })
        )
    });
}

const enabled = { noDevDependencyImports: { enabled: true } };

suite('no-dev-dependency-imports', function () {
    test('rule definition exposes name, schemas and a run function', function () {
        assert.strictEqual(noDevDependencyImportsRule.name, 'noDevDependencyImports');
        assert.strictEqual(typeof noDevDependencyImportsRule.run, 'function');
    });

    test('returns no issues when settings are missing', function () {
        const result = noDevDependencyImportsRule.run({
            bundles: [bundleWithExternals('a', ['leaked'])],
            settings: undefined,
            perPackageSettings: new Map(),
            packageConfigs: { a: { mainPackageJson: { devDependencies: { leaked: '1.0.0' } } } }
        });

        assert.deepStrictEqual(result, []);
    });

    test('returns no issues when the rule is disabled', function () {
        const result = noDevDependencyImportsRule.run({
            bundles: [bundleWithExternals('a', ['leaked'])],
            settings: { noDevDependencyImports: { enabled: false } },
            perPackageSettings: new Map(),
            packageConfigs: { a: { mainPackageJson: { devDependencies: { leaked: '1.0.0' } } } }
        });

        assert.deepStrictEqual(result, []);
    });

    test('returns no issues when packageConfigs is omitted entirely', function () {
        const result = noDevDependencyImportsRule.run({
            bundles: [bundleWithExternals('a', ['leaked'])],
            settings: enabled,
            perPackageSettings: new Map()
        });

        assert.deepStrictEqual(result, []);
    });

    test('returns no issues when packageConfigs has no entry for the bundle', function () {
        const result = noDevDependencyImportsRule.run({
            bundles: [bundleWithExternals('a', ['leaked'])],
            settings: enabled,
            perPackageSettings: new Map(),
            packageConfigs: {}
        });

        assert.deepStrictEqual(result, []);
    });

    test('returns no issues when the package has no main package.json', function () {
        const result = noDevDependencyImportsRule.run({
            bundles: [bundleWithExternals('a', ['leaked'])],
            settings: enabled,
            perPackageSettings: new Map(),
            packageConfigs: { a: {} }
        });

        assert.deepStrictEqual(result, []);
    });

    test('reports an external dependency that is only declared in devDependencies', function () {
        const result = noDevDependencyImportsRule.run({
            bundles: [bundleWithExternals('a', ['leaked'])],
            settings: enabled,
            perPackageSettings: new Map(),
            packageConfigs: { a: { mainPackageJson: { devDependencies: { leaked: '1.0.0' } } } }
        });

        assert.deepStrictEqual(result, [
            'Package "a" imports "leaked" which is only declared in devDependencies of the main package.json'
        ]);
    });

    test('does not report when the dependency is also declared in dependencies', function () {
        const result = noDevDependencyImportsRule.run({
            bundles: [bundleWithExternals('a', ['shared'])],
            settings: enabled,
            perPackageSettings: new Map(),
            packageConfigs: {
                a: {
                    mainPackageJson: {
                        dependencies: { shared: '1.0.0' },
                        devDependencies: { shared: '1.0.0' }
                    }
                }
            }
        });

        assert.deepStrictEqual(result, []);
    });

    test('does not report when the dependency is declared in peerDependencies', function () {
        const result = noDevDependencyImportsRule.run({
            bundles: [bundleWithExternals('a', ['peer'])],
            settings: enabled,
            perPackageSettings: new Map(),
            packageConfigs: {
                a: {
                    mainPackageJson: {
                        peerDependencies: { peer: '1.0.0' },
                        devDependencies: { peer: '1.0.0' }
                    }
                }
            }
        });

        assert.deepStrictEqual(result, []);
    });

    test('does not report when the dependency is not in any list', function () {
        const result = noDevDependencyImportsRule.run({
            bundles: [bundleWithExternals('a', ['unknown'])],
            settings: enabled,
            perPackageSettings: new Map(),
            packageConfigs: { a: { mainPackageJson: {} } }
        });

        assert.deepStrictEqual(result, []);
    });

    test('reports independently per bundle', function () {
        const result = noDevDependencyImportsRule.run({
            bundles: [bundleWithExternals('a', ['leak-a']), bundleWithExternals('b', ['fine'])],
            settings: enabled,
            perPackageSettings: new Map(),
            packageConfigs: {
                a: { mainPackageJson: { devDependencies: { 'leak-a': '1.0.0' } } },
                b: { mainPackageJson: { dependencies: { fine: '1.0.0' } } }
            }
        });

        assert.deepStrictEqual(result, [
            'Package "a" imports "leak-a" which is only declared in devDependencies of the main package.json'
        ]);
    });
});
