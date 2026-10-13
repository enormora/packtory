import assert from 'node:assert';
import { suite, test } from 'mocha';
import { safeParse } from '../common/schema-validation.ts';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import {
    packageSchemaWithAllCommonSettings,
    packageSchemaWithMandatoryMainPackageManifest,
    packageSchemaWithMandatorySourcesFolder,
    packageSchemaWithPartialCommonSettings
} from './package-schemas.ts';

suite('package-schemas', function () {
    test('package schema with all common settings accepts a valid package', function () {
        assert.strictEqual(
            safeParse(packageSchemaWithAllCommonSettings, {
                sourcesFolder: 'source',
                mainPackageManifest: { type: 'module' },
                name: 'package',
                roots: { main: { javaScript: 'index.js' } }
            })
                .success,
            true
        );
    });

    test('package schema with all common settings rejects missing roots', function () {
        assert.strictEqual(
            safeParse(packageSchemaWithAllCommonSettings, {
                sourcesFolder: 'source',
                mainPackageManifest: { type: 'module' },
                name: 'package'
            })
                .success,
            false
        );
    });

    test('package schema with partial common settings accepts package-specific settings only', function () {
        assert.strictEqual(
            safeParse(packageSchemaWithPartialCommonSettings, {
                name: 'package',
                roots: { main: { javaScript: 'index.js' } }
            })
                .success,
            true
        );
    });

    test('package schema with mandatory sourcesFolder rejects packages without it', function () {
        assert.strictEqual(
            safeParse(packageSchemaWithMandatorySourcesFolder, {
                mainPackageManifest: { type: 'module' },
                name: 'package',
                roots: { main: { javaScript: 'index.js' } }
            })
                .success,
            false
        );
    });

    test('package schema with mandatory mainPackageManifest rejects packages without it', function () {
        assert.strictEqual(
            safeParse(packageSchemaWithMandatoryMainPackageManifest, {
                sourcesFolder: 'source',
                name: 'package',
                roots: { main: { javaScript: 'index.js' } }
            })
                .success,
            false
        );
    });

    test(
        'package schema with all common settings: validation succeeds with all required fields',
        checkValidationSuccess({
            schema: packageSchemaWithAllCommonSettings,
            data: {
                sourcesFolder: 'source',
                mainPackageManifest: { type: 'module' },
                name: 'package',
                roots: { main: { javaScript: 'index.js' } }
            },
            expectedData: {
                sourcesFolder: 'source',
                mainPackageManifest: { type: 'module' },
                name: 'package',
                roots: { main: { javaScript: 'index.js' } }
            }
        })
    );

    test(
        'package schema with all common settings: validation fails when roots is missing',
        checkValidationFailure({
            schema: packageSchemaWithAllCommonSettings,
            data: {
                sourcesFolder: 'source',
                mainPackageManifest: { type: 'module' },
                name: 'package'
            },
            expectedMessages: [ 'at roots: missing property' ]
        })
    );

    test(
        'package schema with partial common settings: validation succeeds without inherited fields',
        checkValidationSuccess({
            schema: packageSchemaWithPartialCommonSettings,
            data: {
                name: 'package',
                roots: { main: { javaScript: 'index.js' } }
            },
            expectedData: {
                name: 'package',
                roots: { main: { javaScript: 'index.js' } }
            }
        })
    );

    test(
        'package schema with mandatory sourcesFolder: validation fails when sourcesFolder is missing',
        checkValidationFailure({
            schema: packageSchemaWithMandatorySourcesFolder,
            data: {
                mainPackageManifest: { type: 'module' },
                name: 'package',
                roots: { main: { javaScript: 'index.js' } }
            },
            expectedMessages: [ 'at sourcesFolder: missing property' ]
        })
    );

    test(
        'package schema with mandatory mainPackageManifest: validation fails when mainPackageManifest is missing',
        checkValidationFailure({
            schema: packageSchemaWithMandatoryMainPackageManifest,
            data: {
                sourcesFolder: 'source',
                name: 'package',
                roots: { main: { javaScript: 'index.js' } }
            },
            expectedMessages: [ 'at mainPackageManifest: missing property' ]
        })
    );
});
