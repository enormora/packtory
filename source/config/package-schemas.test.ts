import assert from 'node:assert';
import { safeParse } from '@schema-hub/zod-error-formatter';
import { test } from 'mocha';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import {
    packageSchemaWithAllCommonSettings,
    packageSchemaWithMandatoryMainPackageJson,
    packageSchemaWithMandatorySourcesFolder,
    packageSchemaWithPartialCommonSettings
} from './package-schemas.ts';

test('package schema with all common settings accepts a valid package', () => {
    assert.strictEqual(
        safeParse(packageSchemaWithAllCommonSettings, {
            sourcesFolder: 'src',
            mainPackageJson: {},
            name: 'pkg',
            entryPoints: [{ js: 'index.js' }]
        }).success,
        true
    );
});

test('package schema with all common settings rejects empty entryPoints', () => {
    assert.strictEqual(
        safeParse(packageSchemaWithAllCommonSettings, {
            sourcesFolder: 'src',
            mainPackageJson: {},
            name: 'pkg',
            entryPoints: []
        }).success,
        false
    );
});

test('package schema with partial common settings accepts package-specific settings only', () => {
    assert.strictEqual(
        safeParse(packageSchemaWithPartialCommonSettings, {
            name: 'pkg',
            entryPoints: [{ js: 'index.js' }]
        }).success,
        true
    );
});

test('package schema with mandatory sourcesFolder rejects packages without it', () => {
    assert.strictEqual(
        safeParse(packageSchemaWithMandatorySourcesFolder, {
            mainPackageJson: {},
            name: 'pkg',
            entryPoints: [{ js: 'index.js' }]
        }).success,
        false
    );
});

test('package schema with mandatory mainPackageJson rejects packages without it', () => {
    assert.strictEqual(
        safeParse(packageSchemaWithMandatoryMainPackageJson, {
            sourcesFolder: 'src',
            name: 'pkg',
            entryPoints: [{ js: 'index.js' }]
        }).success,
        false
    );
});

test(
    'package schema with all common settings: validation succeeds with all required fields',
    checkValidationSuccess({
        schema: packageSchemaWithAllCommonSettings,
        data: {
            sourcesFolder: 'src',
            mainPackageJson: {},
            name: 'pkg',
            entryPoints: [{ js: 'index.js' }]
        },
        expectedData: {
            sourcesFolder: 'src',
            mainPackageJson: {},
            name: 'pkg',
            entryPoints: [{ js: 'index.js' }]
        }
    })
);

test(
    'package schema with all common settings: validation fails when entryPoints is empty',
    checkValidationFailure({
        schema: packageSchemaWithAllCommonSettings,
        data: {
            sourcesFolder: 'src',
            mainPackageJson: {},
            name: 'pkg',
            entryPoints: []
        },
        expectedMessages: ['at entryPoints[0]: missing key']
    })
);

test(
    'package schema with partial common settings: validation succeeds without inherited fields',
    checkValidationSuccess({
        schema: packageSchemaWithPartialCommonSettings,
        data: {
            name: 'pkg',
            entryPoints: [{ js: 'index.js' }]
        },
        expectedData: {
            name: 'pkg',
            entryPoints: [{ js: 'index.js' }]
        }
    })
);

test(
    'package schema with mandatory sourcesFolder: validation fails when sourcesFolder is missing',
    checkValidationFailure({
        schema: packageSchemaWithMandatorySourcesFolder,
        data: {
            mainPackageJson: {},
            name: 'pkg',
            entryPoints: [{ js: 'index.js' }]
        },
        expectedMessages: ['at sourcesFolder: missing property']
    })
);

test(
    'package schema with mandatory mainPackageJson: validation fails when mainPackageJson is missing',
    checkValidationFailure({
        schema: packageSchemaWithMandatoryMainPackageJson,
        data: {
            sourcesFolder: 'src',
            name: 'pkg',
            entryPoints: [{ js: 'index.js' }]
        },
        expectedMessages: ['at mainPackageJson: missing property']
    })
);
