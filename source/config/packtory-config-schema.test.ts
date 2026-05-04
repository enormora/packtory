import assert from 'node:assert';
import { test } from 'mocha';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { packtoryConfigSchema } from './packtory-config-schema.ts';

const validConfig = {
    registrySettings: { token: 'foo' },
    packages: [{ sourcesFolder: 'source', mainPackageJson: {}, name: 'foo', entryPoints: [{ js: 'foo' }] }]
};

test('packtory config schema accepts a valid config', () => {
    assert.strictEqual(packtoryConfigSchema.safeParse(validConfig).success, true);
});

test('packtory config schema rejects configs without registrySettings', () => {
    assert.strictEqual(
        packtoryConfigSchema.safeParse({
            packages: [{ sourcesFolder: 'source', mainPackageJson: {}, name: 'foo', entryPoints: [{ js: 'foo' }] }]
        }).success,
        false
    );
});

test(
    'packtory config schema: validation succeeds for a minimal valid config',
    checkValidationSuccess({
        schema: packtoryConfigSchema,
        data: validConfig,
        expectedData: validConfig
    })
);

test(
    'packtory config schema: validation fails when registrySettings is missing',
    checkValidationFailure({
        schema: packtoryConfigSchema,
        data: {
            packages: [{ sourcesFolder: 'source', mainPackageJson: {}, name: 'foo', entryPoints: [{ js: 'foo' }] }]
        },
        expectedMessages: ['at registrySettings: missing property']
    })
);
