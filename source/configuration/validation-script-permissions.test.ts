import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Result } from 'true-myth';
import {
    allowScriptsErrorFor,
    commonScriptsAttribute,
    fooPackage,
    fooPackageWithScripts,
    placementErrorMessage,
    postinstallScripts,
    publicWithAllowScripts,
    withCommonWithoutPublishSettings,
    withCustomCommon,
    withRegistry
} from '../test-libraries/validation-test-support.ts';
import { validateConfiguration } from './validation.ts';

suite('validation script permissions', function () {
    suite('script permission validation', function () {
        test('accepts a config with per-package scripts and per-package allowScripts true', function () {
            const result = validateConfiguration(
                withRegistry({
                    packages: [
                        {
                            name: 'foo',
                            roots: { main: { javaScript: 'foo' } },
                            additionalPackageManifestAttributes: { scripts: postinstallScripts },
                            publishSettings: { access: 'public', allowScripts: true }
                        }
                    ]
                })
            );

            assert.strictEqual(result.isOk, true);
        });

        test('accepts a config with per-package scripts and common allowScripts true', function () {
            const result = validateConfiguration(withCustomCommon(publicWithAllowScripts, [ fooPackageWithScripts ]));

            assert.strictEqual(result.isOk, true);
        });

        test('accepts a config with common scripts and common allowScripts true and per-package nothing', function () {
            const result = validateConfiguration(
                withCustomCommon({ ...commonScriptsAttribute, ...publicWithAllowScripts }, [ fooPackage() ])
            );

            assert.strictEqual(result.isOk, true);
        });

        test('accepts a config with allowScripts true but no scripts anywhere', function () {
            const result = validateConfiguration(withCustomCommon(publicWithAllowScripts, [ fooPackage() ]));

            assert.strictEqual(result.isOk, true);
        });

        test('rejects a config with per-package scripts and no allowScripts anywhere', function () {
            const result = validateConfiguration(withRegistry({ packages: [ fooPackageWithScripts ] }));

            assert.deepStrictEqual(result, Result.err([ allowScriptsErrorFor('foo') ]));
        });

        test('rejects every package when common scripts and no allowScripts anywhere', function () {
            const result = validateConfiguration(
                withCustomCommon({ ...commonScriptsAttribute, publishSettings: { access: 'public' } }, [
                    fooPackage(),
                    fooPackage('bar')
                ])
            );

            assert.deepStrictEqual(result, Result.err([ allowScriptsErrorFor('foo'), allowScriptsErrorFor('bar') ]));
        });

        test('rejects with both placement and allowScripts errors when scripts are set but publishSettings is missing', function () {
            const result = validateConfiguration(withCommonWithoutPublishSettings([ fooPackageWithScripts ]));

            assert.deepStrictEqual(result, Result.err([ placementErrorMessage, allowScriptsErrorFor('foo') ]));
        });

        test('rejects when common allows scripts but per-package replaces publishSettings without allowScripts', function () {
            const result = validateConfiguration(
                withCustomCommon({ ...commonScriptsAttribute, ...publicWithAllowScripts }, [
                    { name: 'foo', roots: { main: { javaScript: 'foo' } }, publishSettings: { access: 'public' } }
                ])
            );

            assert.deepStrictEqual(result, Result.err([ allowScriptsErrorFor('foo') ]));
        });
    });
});
