import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Result } from 'true-myth';
import {
    type ConfigInput,
    expectCyclicError,
    fooPackage,
    packageWithDependencies,
    withRegistry
} from '../test-libraries/validation-test-support.ts';
import { validateConfig } from './validation.ts';

function configWithCommonAdditionalFiles(additionalFiles: readonly unknown[]): ConfigInput {
    return withRegistry({
        commonPackageSettings: {
            sourcesFolder: 'foo',
            mainPackageJson: { type: 'module' },
            publishSettings: { access: 'public' },
            additionalFiles
        },
        packages: [ fooPackage() ]
    });
}

function assertCommonAdditionalFiles(
    config: ConfigInput,
    expectedAdditionalFiles: readonly { readonly inputFilePath: string; readonly targetFilePath: string; }[]
): void {
    const result = validateConfig(config);

    assert.strictEqual(result.isOk, true);
    assert.deepStrictEqual(result.value.packtoryConfig.commonPackageSettings?.additionalFiles, expectedAdditionalFiles);
}

suite('validation package graph', function () {
    suite('duplicate packages and dependency cycles', function () {
        test('returns the issues when the given config doesn’t match the schema', function () {
            const result = validateConfig({ not: 'valid' });
            assert.deepStrictEqual(result, Result.err([ 'invalid value doesn’t match expected union' ]));
        });

        suite('additional file aliases', function () {
            test('normalizes common additional file sourceFilePath aliases', function () {
                assertCommonAdditionalFiles(
                    configWithCommonAdditionalFiles([ { sourceFilePath: 'LICENSE', targetFilePath: 'LICENSE' } ]),
                    [ { inputFilePath: 'LICENSE', targetFilePath: 'LICENSE' } ]
                );
            });

            test('keeps common additional file inputFilePath values', function () {
                assertCommonAdditionalFiles(
                    configWithCommonAdditionalFiles([ { inputFilePath: 'LICENSE', targetFilePath: 'LICENSE' } ]),
                    [ { inputFilePath: 'LICENSE', targetFilePath: 'LICENSE' } ]
                );
            });

            test('rejects additional file entries with sourceFilePath and inputFilePath', function () {
                const result = validateConfig(
                    configWithCommonAdditionalFiles([
                        { sourceFilePath: 'legacy.md', inputFilePath: 'current.md', targetFilePath: 'readme.md' }
                    ])
                );

                assert.deepStrictEqual(result, Result.err([ 'invalid value doesn’t match expected union' ]));
            });

            test('rejects malformed additional file alias entries without throwing', function () {
                const result = validateConfig(configWithCommonAdditionalFiles([ null ]));

                assert.deepStrictEqual(result, Result.err([ 'invalid value doesn’t match expected union' ]));
            });

            test('normalizes package additional file sourceFilePath aliases', function () {
                const result = validateConfig(
                    withRegistry({
                        packages: [
                            {
                                ...fooPackage(),
                                additionalFiles: [ { sourceFilePath: 'readme.md', targetFilePath: 'readme.md' } ]
                            }
                        ]
                    })
                );

                assert.strictEqual(result.isOk, true);
                assert.deepStrictEqual(result.value.packageConfigs.foo?.additionalFiles, [
                    { inputFilePath: 'readme.md', targetFilePath: 'readme.md' }
                ]);
            });
        });

        test('returns an issue when a package with the same name exists twice', function () {
            const result = validateConfig(withRegistry({ packages: [ fooPackage(), fooPackage() ] }));

            assert.deepStrictEqual(result, Result.err([ 'Duplicate package definition with the name "foo"' ]));
        });

        test('returns two issues when packages with the same name exists thrice', function () {
            const result = validateConfig(withRegistry({ packages: [ fooPackage(), fooPackage(), fooPackage() ] }));

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
                    packages: [ fooPackage(), fooPackage(), fooPackage('bar'), fooPackage('bar') ]
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
                [
                    packageWithDependencies('a', 'bundleDependencies', [ 'b' ]),
                    packageWithDependencies('b', 'bundleDependencies', [ 'a' ])
                ],
                'a→b→a'
            );
        });

        test('returns an issue when there is a long cycle per bundleDependencies', function () {
            expectCyclicError(
                [
                    packageWithDependencies('a', 'bundleDependencies', [ 'd' ]),
                    packageWithDependencies('b', 'bundleDependencies', [ 'a' ]),
                    packageWithDependencies('c', 'bundleDependencies', [ 'b' ]),
                    packageWithDependencies('d', 'bundleDependencies', [ 'c' ])
                ],
                'a→d→c→b→a'
            );
        });

        test('returns an issue when there is a cycle per bundlePeerDependencies', function () {
            expectCyclicError(
                [
                    packageWithDependencies('a', 'bundlePeerDependencies', [ 'b' ]),
                    packageWithDependencies('b', 'bundlePeerDependencies', [ 'a' ])
                ],
                'a→b→a'
            );
        });

        test('returns an issue when there is a cycle per bundleDependencies and bundlePeerDependencies', function () {
            expectCyclicError(
                [
                    packageWithDependencies('a', 'bundleDependencies', [ 'b' ]),
                    packageWithDependencies('b', 'bundlePeerDependencies', [ 'a' ])
                ],
                'a→b→a'
            );
        });
    });

    suite('dependency references and package interfaces', function () {
        test('returns an issue when a package depends on itself', function () {
            expectCyclicError([ packageWithDependencies('a', 'bundleDependencies', [ 'a' ]) ], 'a→a');
        });

        test('returns an issue when a package bundle dependency does not exit', function () {
            const result = validateConfig(
                withRegistry({
                    packages: [ { name: 'a', roots: { main: { js: 'foo' } }, bundleDependencies: [ 'b' ] } ]
                })
            );

            assert.deepStrictEqual(result, Result.err([ 'Bundle dependency "b" referenced in "a" does not exist' ]));
        });

        test('returns an issue when a package bundle peer dependency does not exit', function () {
            const result = validateConfig(
                withRegistry({
                    packages: [ { name: 'a', roots: { main: { js: 'foo' } }, bundlePeerDependencies: [ 'b' ] } ]
                })
            );

            assert.deepStrictEqual(
                result,
                Result.err([ 'Bundle peer dependency "b" referenced in "a" does not exist' ])
            );
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

            assert.deepStrictEqual(
                result,
                Result.err([ 'Package "foo" maps both root "main" and "alias" to "index.js"' ])
            );
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
                Result.err([ 'Package "foo" must define defaultModuleRoot when multiple roots exist' ])
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

            assert.deepStrictEqual(
                result,
                Result.err([ 'Package "foo" references unknown defaultModuleRoot "missing"' ])
            );
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
                                modules: [ { root: 'main', export: '.' } ]
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
    });
});
