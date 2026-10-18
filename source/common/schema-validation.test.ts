import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { $ZodType } from 'zod/v4/core';
import { z } from 'zod/mini';
import { additionalFileDescriptionSchema } from '../configuration/additional-files.ts';
import { mainPackageManifestSchema } from '../configuration/main-package-manifest-schema.ts';
import { packtoryConfigurationSchema } from '../configuration/packtory-configuration-schema.ts';
import { versioningSettingsSchema } from '../configuration/versioning-settings.ts';
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
            'at inputFilePath: missing property'
        ]);
    });

    test('keeps invalid literal array messages stable', function () {
        assert.deepStrictEqual(validationIssues(mainPackageManifestSchema, { type: [] }), [
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
                inputFilePath: 'source.txt',
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
            validationIssues(packtoryConfigurationSchema, {
                registrySettings: { authentication: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: { additionalPackageManifestAttributes: { dependencies: '1.0.0' } },
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageManifest: { type: 'module' },
                        name: 'package',
                        roots: { main: { javaScript: 'index.js' } }
                    }
                ]
            }),
            [ 'invalid value doesn’t match expected union' ]
        );
    });
});
