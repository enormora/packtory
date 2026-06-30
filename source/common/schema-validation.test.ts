import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { $ZodType } from 'zod/v4/core';
import { z } from 'zod/mini';
import { additionalFileDescriptionSchema } from '../config/additional-files.ts';
import { mainPackageJsonSchema } from '../config/main-package-json-schema.ts';
import { packtoryConfigSchema } from '../config/packtory-config-schema.ts';
import { versioningSettingsSchema } from '../config/versioning-settings.ts';
import { safeParse } from './schema-validation.ts';

function validationIssues(schema: Readonly<$ZodType>, data: unknown): readonly string[] {
    const result = safeParse(schema, data);
    if (result.success) {
        assert.fail('Validation succeeded but a failure was expected');
    }

    return result.error.issues;
}

suite('schema-validation', function () {
    test('keeps missing property messages stable', function () {
        assert.deepStrictEqual(validationIssues(additionalFileDescriptionSchema, { targetFilePath: 'file.txt' }), [
            'at sourceFilePath: missing property'
        ]);
    });

    test('keeps invalid literal array messages stable', function () {
        assert.deepStrictEqual(validationIssues(mainPackageJsonSchema, { type: [] }), [
            'at type: invalid literal: expected "module", but got array'
        ]);
    });

    test('keeps numeric path segments stable', function () {
        const schema = z.tuple([ z.object({ type: z.literal('module') }) ]);

        assert.deepStrictEqual(validationIssues(schema, [ { type: 'commonjs' } ]), [
            'at [0].type: invalid literal: expected "module", but got string'
        ]);
    });

    test('keeps refinement messages stable', function () {
        assert.deepStrictEqual(
            validationIssues(additionalFileDescriptionSchema, {
                sourceFilePath: 'source.txt',
                targetFilePath: '..'
            }),
            [ 'at targetFilePath: invalid input' ]
        );
    });

    test('keeps union messages stable', function () {
        assert.deepStrictEqual(validationIssues(versioningSettingsSchema, { automatic: false, source: 'unknown' }), [
            'invalid value doesn’t match expected union'
        ]);
    });

    test('keeps nested union messages stable when upstream reports only invalid input', function () {
        assert.deepStrictEqual(
            validationIssues(packtoryConfigSchema, {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: { additionalPackageJsonAttributes: { dependencies: '1.0.0' } },
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'package',
                        roots: { main: { js: 'index.js' } }
                    }
                ]
            }),
            [ 'invalid value doesn’t match expected union' ]
        );
    });
});
