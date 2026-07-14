import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Result } from 'true-myth';
import {
    duplicateCAndMissingBErrors,
    duplicateCAndMissingBPackages,
    fooPackage,
    packageSpecificPublishSettings,
    packageWithDependencies,
    placementErrorMessage,
    withCommonWithoutPublishSettings,
    withRegistry
} from '../test-libraries/validation-test-support.ts';
import { validateConfig, validateConfigWithoutRegistry } from './validation.ts';

suite('validation publish settings', function () {
    suite('explicit package interface validation', function () {
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
                                modules: [ { root: 'main', export: '.' } ],
                                privateRoots: [ 'main', 'missing', 'worker', 'worker' ]
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
                        packageWithDependencies('a', 'bundleDependencies', [ 'b' ]),
                        packageWithDependencies('b', 'bundleDependencies', [ 'a' ]),
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

        test('returns a missing dependency and duplicate package issue at the same time', function () {
            const result = validateConfig(withRegistry({ packages: duplicateCAndMissingBPackages }));

            assert.deepStrictEqual(result, Result.err(duplicateCAndMissingBErrors));
        });

        test('doesn’t report cyclic dependency issues when there is also a missing dependency', function () {
            const result = validateConfig(
                withRegistry({
                    packages: [
                        { name: 'a', roots: { main: { js: 'foo' } }, bundlePeerDependencies: [ 'b' ] },
                        { name: 'c', roots: { main: { js: 'foo' } }, bundlePeerDependencies: [ 'c' ] }
                    ]
                })
            );

            assert.deepStrictEqual(
                result,
                Result.err([ 'Bundle peer dependency "b" referenced in "a" does not exist' ])
            );
        });

        test('accepts a config where checks is defined but noDuplicatedFiles is omitted', function () {
            const result = validateConfig(
                withRegistry({
                    checks: {},
                    packages: [ { name: 'a', roots: { main: { js: 'foo' } } } ]
                })
            );

            assert.strictEqual(result.isOk, true);
        });

        test('accepts a config where checks.noDuplicatedFiles is defined without an allowList', function () {
            const result = validateConfig(
                withRegistry({
                    checks: { noDuplicatedFiles: { enabled: true } },
                    packages: [ { name: 'a', roots: { main: { js: 'foo' } } } ]
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
                            checks: { noDuplicatedFiles: { allowList: [ 'LICENSE' ] } }
                        }
                    ]
                })
            );

            assert.strictEqual(result.isOk, true);
        });
    });

    suite('registryless config and publish settings', function () {
        test('validateConfigWithoutRegistry() returns schema issues when the config is invalid', function () {
            const result = validateConfigWithoutRegistry({ not: 'valid' });

            assert.deepStrictEqual(result, Result.err([ 'invalid value doesn’t match expected union' ]));
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

        test('returns an issue when publishSettings is missing from both commonPackageSettings and every package', function () {
            const result = validateConfig(
                withCommonWithoutPublishSettings([ { name: 'foo', roots: { main: { js: 'foo' } } } ])
            );

            assert.deepStrictEqual(result, Result.err([ placementErrorMessage ]));
        });

        test('returns an issue when publishSettings is missing for at least one package and not provided in common', function () {
            const result = validateConfig(
                withCommonWithoutPublishSettings([
                    { name: 'foo', roots: { main: { js: 'foo' } }, publishSettings: { access: 'public' } },
                    { name: 'bar', roots: { main: { js: 'bar' } } }
                ])
            );

            assert.deepStrictEqual(result, Result.err([ placementErrorMessage ]));
        });

        test('accepts a config when publishSettings is set only in commonPackageSettings', function () {
            const result = validateConfig(
                withRegistry({ packages: [ { name: 'foo', roots: { main: { js: 'foo' } } } ] })
            );

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

        test('accepts a config without scripts anywhere', function () {
            const result = validateConfig(
                withRegistry({ packages: [ { name: 'foo', roots: { main: { js: 'foo' } } } ] })
            );

            assert.strictEqual(result.isOk, true);
        });
    });
});
