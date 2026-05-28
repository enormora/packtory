import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Result } from 'true-myth';
import { minimalPackageConfigFactory } from '../test-libraries/config-fixtures.ts';
import { validateConfig, validateConfigWithoutRegistry } from './validation.ts';

type ConfigInput = Record<string, unknown>;

function withRegistry(extra: ConfigInput): ConfigInput {
    return {
        registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
        commonPackageSettings: {
            sourcesFolder: 'foo',
            mainPackageJson: { type: 'module' },
            publishSettings: { access: 'public' }
        },
        ...extra
    };
}

type CycleDependencyKind = 'bundleDependencies' | 'bundlePeerDependencies';

function packageWithDeps(name: string, kind: CycleDependencyKind, deps: readonly string[]): ConfigInput {
    return { ...minimalPackageConfigFactory.build({ name }), [kind]: deps };
}

function expectCyclicError(packages: readonly ConfigInput[], expectedPath: string): void {
    const result = validateConfig(withRegistry({ packages }));
    assert.deepStrictEqual(result, Result.err([`Unexpected cyclic dependency path: [${expectedPath}]`]));
}

function fooPackage(name = 'foo'): ConfigInput {
    return minimalPackageConfigFactory.build({ name });
}

suite('validation', function () {
    test('returns the issues when the given config doesn’t match the schema', function () {
        const result = validateConfig({ not: 'valid' });
        assert.deepStrictEqual(result, Result.err(['invalid value doesn’t match expected union']));
    });

    test('returns an issue when a package with the same name exists twice', function () {
        const result = validateConfig(withRegistry({ packages: [fooPackage(), fooPackage()] }));

        assert.deepStrictEqual(result, Result.err(['Duplicate package definition with the name "foo"']));
    });

    test('returns two issues when packages with the same name exists thrice', function () {
        const result = validateConfig(withRegistry({ packages: [fooPackage(), fooPackage(), fooPackage()] }));

        assert.deepStrictEqual(
            result,
            Result.err([
                'Duplicate package definition with the name "foo"',
                'Duplicate package definition with the name "foo"'
            ])
        );
    });

    test('returns two issues when there are two duplicated package names', function () {
        const result = validateConfig(
            withRegistry({
                packages: [fooPackage(), fooPackage(), fooPackage('bar'), fooPackage('bar')]
            })
        );

        assert.deepStrictEqual(
            result,
            Result.err([
                'Duplicate package definition with the name "foo"',
                'Duplicate package definition with the name "bar"'
            ])
        );
    });

    test('returns an issue when there is a cycle per bundleDependencies', function () {
        expectCyclicError(
            [packageWithDeps('a', 'bundleDependencies', ['b']), packageWithDeps('b', 'bundleDependencies', ['a'])],
            'a→b→a'
        );
    });

    test('returns an issue when there is a long cycle per bundleDependencies', function () {
        expectCyclicError(
            [
                packageWithDeps('a', 'bundleDependencies', ['d']),
                packageWithDeps('b', 'bundleDependencies', ['a']),
                packageWithDeps('c', 'bundleDependencies', ['b']),
                packageWithDeps('d', 'bundleDependencies', ['c'])
            ],
            'a→d→c→b→a'
        );
    });

    test('returns an issue when there is a cycle per bundlePeerDependencies', function () {
        expectCyclicError(
            [
                packageWithDeps('a', 'bundlePeerDependencies', ['b']),
                packageWithDeps('b', 'bundlePeerDependencies', ['a'])
            ],
            'a→b→a'
        );
    });

    test('returns an issue when there is a cycle per bundleDependencies and bundlePeerDependencies', function () {
        expectCyclicError(
            [packageWithDeps('a', 'bundleDependencies', ['b']), packageWithDeps('b', 'bundlePeerDependencies', ['a'])],
            'a→b→a'
        );
    });

    test('returns an issue when a package depends on itself', function () {
        expectCyclicError([packageWithDeps('a', 'bundleDependencies', ['a'])], 'a→a');
    });

    test('returns an issue when a package bundle dependency does not exit', function () {
        const result = validateConfig(
            withRegistry({
                packages: [{ name: 'a', roots: { main: { js: 'foo' } }, bundleDependencies: ['b'] }]
            })
        );

        assert.deepStrictEqual(result, Result.err(['Bundle dependency "b" referenced in "a" does not exist']));
    });

    test('returns an issue when a package bundle peer dependency does not exit', function () {
        const result = validateConfig(
            withRegistry({
                packages: [{ name: 'a', roots: { main: { js: 'foo' } }, bundlePeerDependencies: ['b'] }]
            })
        );

        assert.deepStrictEqual(result, Result.err(['Bundle peer dependency "b" referenced in "a" does not exist']));
    });

    test('returns an issue when two roots point at the same js file', function () {
        const result = validateConfig(
            withRegistry({
                packages: [
                    {
                        name: 'foo',
                        roots: {
                            main: { js: 'index.js' },
                            alias: { js: 'index.js' }
                        },
                        defaultModuleRoot: 'main'
                    }
                ]
            })
        );

        assert.deepStrictEqual(result, Result.err(['Package "foo" maps both root "main" and "alias" to "index.js"']));
    });

    test('returns an issue when implicit packages define multiple roots without defaultModuleRoot', function () {
        const result = validateConfig(
            withRegistry({
                packages: [
                    {
                        name: 'foo',
                        roots: {
                            main: { js: 'index.js' },
                            feature: { js: 'feature.js' }
                        }
                    }
                ]
            })
        );

        assert.deepStrictEqual(
            result,
            Result.err(['Package "foo" must define defaultModuleRoot when multiple roots exist'])
        );
    });

    test('returns an issue when implicit packages reference an unknown defaultModuleRoot', function () {
        const result = validateConfig(
            withRegistry({
                packages: [
                    {
                        name: 'foo',
                        roots: { main: { js: 'index.js' } },
                        defaultModuleRoot: 'missing'
                    }
                ]
            })
        );

        assert.deepStrictEqual(result, Result.err(['Package "foo" references unknown defaultModuleRoot "missing"']));
    });

    test('returns an issue when a package combines defaultModuleRoot with packageInterface', function () {
        const result = validateConfig(
            withRegistry({
                packages: [
                    {
                        name: 'foo',
                        roots: { main: { js: 'index.js' } },
                        defaultModuleRoot: 'main',
                        packageInterface: {
                            modules: [{ root: 'main', export: '.' }]
                        }
                    }
                ]
            })
        );

        assert.deepStrictEqual(
            result,
            Result.err([
                'Package "foo" cannot combine defaultModuleRoot with packageInterface; remove defaultModuleRoot in explicit mode'
            ])
        );
    });

    test('returns issues when explicit modules reference unknown roots or declare duplicate export keys', function () {
        const result = validateConfig(
            withRegistry({
                packages: [
                    {
                        name: 'foo',
                        roots: {
                            main: { js: 'index.js' },
                            helper: { js: 'helper.js' }
                        },
                        packageInterface: {
                            modules: [
                                { root: 'missing', export: '.' },
                                { root: 'main', export: '.' }
                            ]
                        }
                    }
                ]
            })
        );

        assert.deepStrictEqual(
            result,
            Result.err([
                'Package "foo" module export "." references unknown root "missing"',
                'Package "foo" declares duplicate export key "."',
                'Package "foo" defines unused root "helper" in explicit mode'
            ])
        );
    });

    test('returns issues when explicit bins reference unknown roots, reuse names, or leave roots unused', function () {
        const result = validateConfig(
            withRegistry({
                packages: [
                    {
                        name: 'foo',
                        roots: {
                            main: { js: 'index.js' },
                            cli: { js: 'cli.js' }
                        },
                        packageInterface: {
                            bins: [
                                { root: 'missing', name: 'foo' },
                                { root: 'main', name: 'foo' }
                            ]
                        }
                    }
                ]
            })
        );

        assert.deepStrictEqual(
            result,
            Result.err([
                'Package "foo" bin "foo" references unknown root "missing"',
                'Package "foo" declares duplicate bin name "foo"',
                'Package "foo" defines unused root "cli" in explicit mode'
            ])
        );
    });

    test('returns issues when explicit privateRoots reference unknown roots, duplicate entries, or overlap with public roots', function () {
        const result = validateConfig(
            withRegistry({
                packages: [
                    {
                        name: 'foo',
                        roots: {
                            main: { js: 'index.js' },
                            worker: { js: 'worker.js' },
                            helper: { js: 'helper.js' }
                        },
                        packageInterface: {
                            modules: [{ root: 'main', export: '.' }],
                            privateRoots: ['main', 'missing', 'worker', 'worker']
                        }
                    }
                ]
            })
        );

        assert.deepStrictEqual(
            result,
            Result.err([
                'Package "foo" root "main" cannot be both public and private',
                'Package "foo" private root "missing" references unknown root "missing"',
                'Package "foo" declares duplicate private root "worker"',
                'Package "foo" defines unused root "helper" in explicit mode'
            ])
        );
    });

    test('returns multiple issues of different kind', function () {
        const result = validateConfig(
            withRegistry({
                packages: [
                    packageWithDeps('a', 'bundleDependencies', ['b']),
                    packageWithDeps('b', 'bundleDependencies', ['a']),
                    fooPackage(),
                    fooPackage()
                ]
            })
        );

        assert.deepStrictEqual(
            result,
            Result.err([
                'Duplicate package definition with the name "foo"',
                'Unexpected cyclic dependency path: [a→b→a]'
            ])
        );
    });

    const duplicateCAndMissingBPackages: readonly ConfigInput[] = [
        packageWithDeps('a', 'bundlePeerDependencies', ['b']),
        fooPackage('c'),
        fooPackage('c')
    ];

    const duplicateCAndMissingBErrors: readonly string[] = [
        'Duplicate package definition with the name "c"',
        'Bundle peer dependency "b" referenced in "a" does not exist'
    ];

    test('returns a missing dependency and duplicate package issue at the same time', function () {
        const result = validateConfig(withRegistry({ packages: duplicateCAndMissingBPackages }));

        assert.deepStrictEqual(result, Result.err(duplicateCAndMissingBErrors));
    });

    test('doesn’t report cyclic dependency issues when there is also a missing dependency', function () {
        const result = validateConfig(
            withRegistry({
                packages: [
                    { name: 'a', roots: { main: { js: 'foo' } }, bundlePeerDependencies: ['b'] },
                    { name: 'c', roots: { main: { js: 'foo' } }, bundlePeerDependencies: ['c'] }
                ]
            })
        );

        assert.deepStrictEqual(result, Result.err(['Bundle peer dependency "b" referenced in "a" does not exist']));
    });

    test('accepts a config where checks is defined but noDuplicatedFiles is omitted', function () {
        const result = validateConfig(
            withRegistry({
                checks: {},
                packages: [{ name: 'a', roots: { main: { js: 'foo' } } }]
            })
        );

        assert.strictEqual(result.isOk, true);
    });

    test('accepts a config where checks.noDuplicatedFiles is defined without an allowList', function () {
        const result = validateConfig(
            withRegistry({
                checks: { noDuplicatedFiles: { enabled: true } },
                packages: [{ name: 'a', roots: { main: { js: 'foo' } } }]
            })
        );

        assert.strictEqual(result.isOk, true);
    });

    test('accepts a config where packages declare per-package noDuplicatedFiles allowList', function () {
        const result = validateConfig(
            withRegistry({
                checks: { noDuplicatedFiles: { enabled: true } },
                packages: [
                    {
                        name: 'a',
                        roots: { main: { js: 'foo' } },
                        checks: { noDuplicatedFiles: { allowList: ['LICENSE'] } }
                    }
                ]
            })
        );

        assert.strictEqual(result.isOk, true);
    });

    test('validateConfigWithoutRegistry() returns schema issues when the config is invalid', function () {
        const result = validateConfigWithoutRegistry({ not: 'valid' });

        assert.deepStrictEqual(result, Result.err(['invalid value doesn’t match expected union']));
    });

    test('validateConfigWithoutRegistry() returns duplicate and missing dependency issues', function () {
        const result = validateConfigWithoutRegistry({
            commonPackageSettings: {
                sourcesFolder: 'foo',
                mainPackageJson: { type: 'module' },
                publishSettings: { access: 'public' }
            },
            packages: duplicateCAndMissingBPackages
        });

        assert.deepStrictEqual(result, Result.err(duplicateCAndMissingBErrors));
    });

    function withCustomCommon(commonExtras: ConfigInput, packages: readonly ConfigInput[]): ConfigInput {
        return {
            registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
            commonPackageSettings: { sourcesFolder: 'foo', mainPackageJson: { type: 'module' }, ...commonExtras },
            packages
        };
    }

    function withCommonWithoutPublishSettings(packages: readonly ConfigInput[]): ConfigInput {
        return withCustomCommon({}, packages);
    }

    const placementErrorMessage = 'publishSettings must be set in commonPackageSettings or in every package';
    const packageSpecificPublishSettings = [
        { name: 'foo', roots: { main: { js: 'foo' } }, publishSettings: { access: 'public' } },
        { name: 'bar', roots: { main: { js: 'bar' } }, publishSettings: { access: 'restricted' } }
    ] as const;

    test('returns an issue when publishSettings is missing from both commonPackageSettings and every package', function () {
        const result = validateConfig(
            withCommonWithoutPublishSettings([{ name: 'foo', roots: { main: { js: 'foo' } } }])
        );

        assert.deepStrictEqual(result, Result.err([placementErrorMessage]));
    });

    test('returns an issue when publishSettings is missing for at least one package and not provided in common', function () {
        const result = validateConfig(
            withCommonWithoutPublishSettings([
                { name: 'foo', roots: { main: { js: 'foo' } }, publishSettings: { access: 'public' } },
                { name: 'bar', roots: { main: { js: 'bar' } } }
            ])
        );

        assert.deepStrictEqual(result, Result.err([placementErrorMessage]));
    });

    test('accepts a config when publishSettings is set only in commonPackageSettings', function () {
        const result = validateConfig(withRegistry({ packages: [{ name: 'foo', roots: { main: { js: 'foo' } } }] }));

        assert.strictEqual(result.isOk, true);
    });

    test('accepts a config when publishSettings is set only on every package', function () {
        const result = validateConfig(withCommonWithoutPublishSettings(packageSpecificPublishSettings));

        assert.strictEqual(result.isOk, true);
    });

    test('accepts a config when no commonPackageSettings is provided and every package supplies its own publishSettings', function () {
        const result = validateConfig({
            registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
            packages: [
                {
                    sourcesFolder: 'foo',
                    mainPackageJson: { type: 'module' },
                    name: 'foo',
                    roots: { main: { js: 'foo' } },
                    publishSettings: { access: 'public' }
                }
            ]
        });

        assert.strictEqual(result.isOk, true);
    });

    const allowScriptsErrorFor = (packageName: string): string => {
        return (
            `Package "${packageName}": "scripts" in additionalPackageJsonAttributes` +
            ' requires "publishSettings.allowScripts: true"'
        );
    };

    const postinstallScripts = { postinstall: 'echo hi' };

    test('accepts a config without scripts anywhere', function () {
        const result = validateConfig(withRegistry({ packages: [{ name: 'foo', roots: { main: { js: 'foo' } } }] }));

        assert.strictEqual(result.isOk, true);
    });

    test('accepts a config with per-package scripts and per-package allowScripts true', function () {
        const result = validateConfig(
            withRegistry({
                packages: [
                    {
                        name: 'foo',
                        roots: { main: { js: 'foo' } },
                        additionalPackageJsonAttributes: { scripts: postinstallScripts },
                        publishSettings: { access: 'public', allowScripts: true }
                    }
                ]
            })
        );

        assert.strictEqual(result.isOk, true);
    });

    const publicWithAllowScripts = { publishSettings: { access: 'public', allowScripts: true } };
    const commonScriptsAttribute = { additionalPackageJsonAttributes: { scripts: postinstallScripts } };
    const fooPackageWithScripts: ConfigInput = {
        name: 'foo',
        roots: { main: { js: 'foo' } },
        additionalPackageJsonAttributes: { scripts: postinstallScripts }
    };

    test('accepts a config with per-package scripts and common allowScripts true', function () {
        const result = validateConfig(withCustomCommon(publicWithAllowScripts, [fooPackageWithScripts]));

        assert.strictEqual(result.isOk, true);
    });

    test('accepts a config with common scripts and common allowScripts true and per-package nothing', function () {
        const result = validateConfig(
            withCustomCommon({ ...commonScriptsAttribute, ...publicWithAllowScripts }, [fooPackage()])
        );

        assert.strictEqual(result.isOk, true);
    });

    test('accepts a config with allowScripts true but no scripts anywhere', function () {
        const result = validateConfig(withCustomCommon(publicWithAllowScripts, [fooPackage()]));

        assert.strictEqual(result.isOk, true);
    });

    test('rejects a config with per-package scripts and no allowScripts anywhere', function () {
        const result = validateConfig(withRegistry({ packages: [fooPackageWithScripts] }));

        assert.deepStrictEqual(result, Result.err([allowScriptsErrorFor('foo')]));
    });

    test('rejects every package when common scripts and no allowScripts anywhere', function () {
        const result = validateConfig(
            withCustomCommon({ ...commonScriptsAttribute, publishSettings: { access: 'public' } }, [
                fooPackage(),
                fooPackage('bar')
            ])
        );

        assert.deepStrictEqual(result, Result.err([allowScriptsErrorFor('foo'), allowScriptsErrorFor('bar')]));
    });

    test('rejects with both placement and allowScripts errors when scripts are set but publishSettings is missing', function () {
        const result = validateConfig(withCommonWithoutPublishSettings([fooPackageWithScripts]));

        assert.deepStrictEqual(result, Result.err([placementErrorMessage, allowScriptsErrorFor('foo')]));
    });

    test('rejects when common allows scripts but per-package replaces publishSettings without allowScripts', function () {
        const result = validateConfig(
            withCustomCommon({ ...commonScriptsAttribute, ...publicWithAllowScripts }, [
                { name: 'foo', roots: { main: { js: 'foo' } }, publishSettings: { access: 'public' } }
            ])
        );

        assert.deepStrictEqual(result, Result.err([allowScriptsErrorFor('foo')]));
    });
});
