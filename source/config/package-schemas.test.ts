import assert from 'node:assert';
import { suite, test } from 'mocha';
import { safeParse } from '../common/schema-validation.ts';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import {
    packageSchemaWithAllCommonSettings,
    packageSchemaWithMandatoryMainPackageJson,
    packageSchemaWithMandatorySourcesFolder,
    packageSchemaWithPartialCommonSettings
} from './package-schemas.ts';

suite('package-schemas', function () {
    test('package schema with all common settings accepts a valid package', function () {
        assert.strictEqual(
            safeParse(packageSchemaWithAllCommonSettings, {
                sourcesFolder: 'src',
                mainPackageJson: { type: 'module' },
                name: 'pkg',
                roots: { main: { js: 'index.js' } }
            })
                .success,
            true
        );
    });

    test('package schema with all common settings rejects missing roots', function () {
        assert.strictEqual(
            safeParse(packageSchemaWithAllCommonSettings, {
                sourcesFolder: 'src',
                mainPackageJson: { type: 'module' },
                name: 'pkg'
            })
                .success,
            false
        );
    });

    test('package schema with partial common settings accepts package-specific settings only', function () {
        assert.strictEqual(
            safeParse(packageSchemaWithPartialCommonSettings, {
                name: 'pkg',
                roots: { main: { js: 'index.js' } }
            })
                .success,
            true
        );
    });

    test('package schema with mandatory sourcesFolder rejects packages without it', function () {
        assert.strictEqual(
            safeParse(packageSchemaWithMandatorySourcesFolder, {
                mainPackageJson: { type: 'module' },
                name: 'pkg',
                roots: { main: { js: 'index.js' } }
            })
                .success,
            false
        );
    });

    test('package schema with mandatory mainPackageJson rejects packages without it', function () {
        assert.strictEqual(
            safeParse(packageSchemaWithMandatoryMainPackageJson, {
                sourcesFolder: 'src',
                name: 'pkg',
                roots: { main: { js: 'index.js' } }
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
                sourcesFolder: 'src',
                mainPackageJson: { type: 'module' },
                name: 'pkg',
                roots: { main: { js: 'index.js' } }
            },
            expectedData: {
                sourcesFolder: 'src',
                mainPackageJson: { type: 'module' },
                name: 'pkg',
                roots: { main: { js: 'index.js' } }
            }
        })
    );

    test(
        'package schema with all common settings: validation fails when roots is missing',
        checkValidationFailure({
            schema: packageSchemaWithAllCommonSettings,
            data: {
                sourcesFolder: 'src',
                mainPackageJson: { type: 'module' },
                name: 'pkg'
            },
            expectedMessages: [ 'at roots: missing property' ]
        })
    );

    test(
        'package schema with partial common settings: validation succeeds without inherited fields',
        checkValidationSuccess({
            schema: packageSchemaWithPartialCommonSettings,
            data: {
                name: 'pkg',
                roots: { main: { js: 'index.js' } }
            },
            expectedData: {
                name: 'pkg',
                roots: { main: { js: 'index.js' } }
            }
        })
    );

    test(
        'package schema with mandatory sourcesFolder: validation fails when sourcesFolder is missing',
        checkValidationFailure({
            schema: packageSchemaWithMandatorySourcesFolder,
            data: {
                mainPackageJson: { type: 'module' },
                name: 'pkg',
                roots: { main: { js: 'index.js' } }
            },
            expectedMessages: [ 'at sourcesFolder: missing property' ]
        })
    );

    test(
        'package schema with mandatory mainPackageJson: validation fails when mainPackageJson is missing',
        checkValidationFailure({
            schema: packageSchemaWithMandatoryMainPackageJson,
            data: {
                sourcesFolder: 'src',
                name: 'pkg',
                roots: { main: { js: 'index.js' } }
            },
            expectedMessages: [ 'at mainPackageJson: missing property' ]
        })
    );
});
