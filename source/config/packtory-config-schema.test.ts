import assert from 'node:assert';
import { safeParse } from '@schema-hub/zod-error-formatter';
import { suite, test } from 'mocha';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { packtoryConfigSchema } from './packtory-config-schema.ts';

const validConfig = {
    registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
    packages: [
        {
            sourcesFolder: 'source',
            mainPackageJson: { type: 'module' },
            name: 'foo',
            roots: { main: { js: 'foo' } },
            publishSettings: { access: 'public' }
        }
    ]
};

suite('packtory-config-schema', function () {
    test('packtory config schema accepts a valid config', function () {
        assert.strictEqual(safeParse(packtoryConfigSchema, validConfig).success, true);
    });

    test('packtory config schema rejects configs without registrySettings', function () {
        assert.strictEqual(
            safeParse(packtoryConfigSchema, {
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'foo' } },
                        publishSettings: { access: 'public' }
                    }
                ]
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
                packages: [
                    {
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        name: 'foo',
                        roots: { main: { js: 'foo' } },
                        publishSettings: { access: 'public' }
                    }
                ]
            },
            expectedMessages: ['at registrySettings: missing property']
        })
    );

    test(
        'packtory config schema: accepts a config with publishSettings declared in commonPackageSettings only',
        checkValidationSuccess({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: {
                    sourcesFolder: 'source',
                    mainPackageJson: { type: 'module' },
                    publishSettings: { access: 'public', provenance: { type: 'auto' } }
                },
                packages: [{ name: 'foo', roots: { main: { js: 'foo' } } }]
            }
        })
    );

    test(
        'packtory config schema: accepts a config with mixed common default and per-package override',
        checkValidationSuccess({
            schema: packtoryConfigSchema,
            data: {
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                commonPackageSettings: {
                    sourcesFolder: 'source',
                    mainPackageJson: { type: 'module' },
                    publishSettings: { access: 'public' }
                },
                packages: [
                    {
                        name: 'foo',
                        roots: { main: { js: 'foo' } }
                    },
                    {
                        name: 'bar',
                        roots: { main: { js: 'bar' } },
                        publishSettings: { access: 'restricted' }
                    }
                ]
            }
        })
    );
});
