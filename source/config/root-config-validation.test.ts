import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PackageConfig, PackageConfigsByName } from './config.ts';
import { validatePackageSurfaceRules } from './root-config-validation.ts';

function pkg(overrides: Partial<PackageConfig>): PackageConfig {
    return {
        name: 'pkg-a',
        roots: { main: { js: 'index.js' } },
        sourcesFolder: 'src',
        ...overrides
    } as unknown as PackageConfig;
}

function configs(...packages: readonly PackageConfig[]): PackageConfigsByName {
    return Object.fromEntries(packages.map((packageConfig) => [packageConfig.name, packageConfig]));
}

suite('root-config-validation', function () {
    test('validatePackageSurfaceRules returns no issues for a single-root implicit package', function () {
        assert.deepStrictEqual(validatePackageSurfaceRules(configs(pkg({}))), []);
    });

    test('validatePackageSurfaceRules requires defaultModuleRoot when an implicit package has multiple roots', function () {
        const result = validatePackageSurfaceRules(
            configs(pkg({ roots: { main: { js: 'index.js' }, extra: { js: 'extra.js' } } }))
        );

        assert.deepStrictEqual(result, ['Package "pkg-a" must define defaultModuleRoot when multiple roots exist']);
    });

    test('validatePackageSurfaceRules reports an unknown defaultModuleRoot for an implicit package', function () {
        const result = validatePackageSurfaceRules(
            configs(pkg({ roots: { main: { js: 'index.js' } }, defaultModuleRoot: 'missing' } as never))
        );

        assert.deepStrictEqual(result, ['Package "pkg-a" references unknown defaultModuleRoot "missing"']);
    });

    test('validatePackageSurfaceRules reports duplicate javascript targets across roots', function () {
        const result = validatePackageSurfaceRules(
            configs(pkg({ roots: { a: { js: 'index.js' }, b: { js: 'index.js' } } }))
        );

        assert.ok(result.includes('Package "pkg-a" maps both root "a" and "b" to "index.js"'));
    });

    test('validatePackageSurfaceRules reports explicit module exports that reference unknown roots', function () {
        const result = validatePackageSurfaceRules(
            configs(
                pkg({
                    roots: { main: { js: 'index.js' } },
                    packageInterface: { modules: [{ root: 'missing', export: '.' }] }
                })
            )
        );

        assert.ok(
            result.some(
                (issue) => issue.includes('module export "."') && issue.includes('references unknown root "missing"')
            )
        );
    });

    test('validatePackageSurfaceRules reports duplicate explicit export keys', function () {
        const result = validatePackageSurfaceRules(
            configs(
                pkg({
                    roots: { main: { js: 'index.js' }, extra: { js: 'extra.js' } },
                    packageInterface: {
                        modules: [
                            { root: 'main', export: '.' },
                            { root: 'extra', export: '.' }
                        ]
                    }
                })
            )
        );

        assert.ok(result.some((issue) => issue.includes('duplicate export key "."')));
    });

    test('validatePackageSurfaceRules reports an unused root in explicit mode', function () {
        const result = validatePackageSurfaceRules(
            configs(
                pkg({
                    roots: { main: { js: 'index.js' }, unused: { js: 'unused.js' } },
                    packageInterface: { modules: [{ root: 'main', export: '.' }] }
                })
            )
        );

        assert.ok(result.some((issue) => issue.includes('unused root "unused"')));
    });

    test('validatePackageSurfaceRules rejects mixing defaultModuleRoot with packageInterface', function () {
        const result = validatePackageSurfaceRules(
            configs(
                pkg({
                    defaultModuleRoot: 'main',
                    packageInterface: { modules: [{ root: 'main', export: '.' }] }
                } as never)
            )
        );

        assert.ok(result.some((issue) => issue.includes('cannot combine defaultModuleRoot with packageInterface')));
    });

    test('validatePackageSurfaceRules reports a private root that conflicts with a public export', function () {
        const result = validatePackageSurfaceRules(
            configs(
                pkg({
                    roots: { main: { js: 'index.js' } },
                    packageInterface: {
                        modules: [{ root: 'main', export: '.' }],
                        privateRoots: ['main']
                    }
                } as never)
            )
        );

        assert.ok(result.some((issue) => issue.includes('cannot be both public and private')));
    });
});
