import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PackageConfiguration, PackageConfigurationsByName } from './configuration.ts';
import { validatePackageSurfaceRules } from './root-configuration-validation.ts';

function packageConfiguration(overrides: Partial<PackageConfiguration>): PackageConfiguration {
    return {
        name: 'package-a',
        roots: { main: { javaScript: 'index.js' } },
        sourcesFolder: 'source',
        ...overrides
    };
}

function configurations(...packages: readonly PackageConfiguration[]): PackageConfigurationsByName {
    return Object.fromEntries(packages.map(function (packageEntry) {
        return [ packageEntry.name, packageEntry ];
    }));
}

suite('root-config-validation', function () {
    test('validatePackageSurfaceRules returns no issues for a single-root implicit package', function () {
        assert.deepStrictEqual(validatePackageSurfaceRules(configurations(packageConfiguration({}))), []);
    });

    test('validatePackageSurfaceRules requires defaultModuleRoot when an implicit package has multiple roots', function () {
        const result = validatePackageSurfaceRules(
            configurations(
                packageConfiguration({ roots: { main: { javaScript: 'index.js' }, extra: { javaScript: 'extra.js' } } })
            )
        );

        assert.deepStrictEqual(result, [
            'Package "package-a" must define defaultModuleRoot when multiple roots exist'
        ]);
    });

    test('validatePackageSurfaceRules reports an unknown defaultModuleRoot for an implicit package', function () {
        const result = validatePackageSurfaceRules(
            configurations(
                packageConfiguration({ roots: { main: { javaScript: 'index.js' } }, defaultModuleRoot: 'missing' })
            )
        );

        assert.deepStrictEqual(result, [ 'Package "package-a" references unknown defaultModuleRoot "missing"' ]);
    });

    test('validatePackageSurfaceRules reports duplicate javascript targets across roots', function () {
        const result = validatePackageSurfaceRules(
            configurations(
                packageConfiguration({ roots: { a: { javaScript: 'index.js' }, b: { javaScript: 'index.js' } } })
            )
        );

        assert.ok(result.includes('Package "package-a" maps both root "a" and "b" to "index.js"'));
    });

    test('validatePackageSurfaceRules reports explicit module exports that reference unknown roots', function () {
        const result = validatePackageSurfaceRules(
            configurations(
                packageConfiguration({
                    roots: { main: { javaScript: 'index.js' } },
                    packageInterface: { modules: [ { root: 'missing', export: '.' } ] }
                })
            )
        );

        assert.ok(
            result.some(
                function (issue) {
                    return issue.includes('module export "."') && issue.includes('references unknown root "missing"');
                }
            )
        );
    });

    test('validatePackageSurfaceRules reports duplicate explicit export keys', function () {
        const result = validatePackageSurfaceRules(
            configurations(
                packageConfiguration({
                    roots: { main: { javaScript: 'index.js' }, extra: { javaScript: 'extra.js' } },
                    packageInterface: {
                        modules: [
                            { root: 'main', export: '.' },
                            { root: 'extra', export: '.' }
                        ]
                    }
                })
            )
        );

        assert.ok(result.some(function (issue) {
            return issue.includes('duplicate export key "."');
        }));
    });

    test('validatePackageSurfaceRules reports an unused root in explicit mode', function () {
        const result = validatePackageSurfaceRules(
            configurations(
                packageConfiguration({
                    roots: { main: { javaScript: 'index.js' }, unused: { javaScript: 'unused.js' } },
                    packageInterface: { modules: [ { root: 'main', export: '.' } ] }
                })
            )
        );

        assert.ok(result.some(function (issue) {
            return issue.includes('unused root "unused"');
        }));
    });

    test('validatePackageSurfaceRules rejects mixing defaultModuleRoot with packageInterface', function () {
        const result = validatePackageSurfaceRules(
            configurations(
                packageConfiguration({
                    defaultModuleRoot: 'main',
                    packageInterface: { modules: [ { root: 'main', export: '.' } ] }
                } as never)
            )
        );

        assert.ok(result.some(function (issue) {
            return issue.includes('cannot combine defaultModuleRoot with packageInterface');
        }));
    });

    test('validatePackageSurfaceRules reports a private root that conflicts with a public export', function () {
        const result = validatePackageSurfaceRules(
            configurations(
                packageConfiguration({
                    roots: { main: { javaScript: 'index.js' } },
                    packageInterface: {
                        modules: [ { root: 'main', export: '.' } ],
                        privateRoots: [ 'main' ]
                    }
                } as never)
            )
        );

        assert.ok(result.some(function (issue) {
            return issue.includes('cannot be both public and private');
        }));
    });
});
