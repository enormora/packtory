import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { RegistrySettings } from '../../configuration/registry-settings.ts';
import type { AuthenticationResolution, NpmFetchOptions } from './registry-authentication-configuration.ts';
import { retryWithFallbackAuthentication } from './metadata-authentication-retry.ts';

const tokenAuthentication = { type: 'bearer-token', token: 'abc' } as const;

function authenticationResolution(overrides: Partial<AuthenticationResolution> = {}): AuthenticationResolution {
    return {
        authorization: undefined,
        allowsAutomaticRetry: false,
        registry: undefined,
        options: { alwaysAuth: true, registry: undefined },
        ...overrides
    };
}

function authenticationFailure(statusCode: number): Error & { readonly statusCode: number; } {
    return Object.assign(new Error(`HTTP ${statusCode}`), { statusCode });
}

async function expectRethrown(
    settings: RegistrySettings,
    resolution: AuthenticationResolution,
    statusCode: number
): Promise<void> {
    try {
        await retryWithFallbackAuthentication(settings, resolution, async function () {
            throw authenticationFailure(statusCode);
        });
        assert.fail('Expected retryWithFallbackAuthentication() to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as { readonly statusCode: number; }).statusCode, statusCode);
    }
}

suite('metadata-auth-retry', function () {
    test('retryWithFallbackAuthentication returns the run() result when it succeeds on the first attempt', async function () {
        const callOptions: NpmFetchOptions[] = [];

        const result = await retryWithFallbackAuthentication(
            { authentication: tokenAuthentication },
            authenticationResolution(),
            async function ({ options }) {
                callOptions.push(options);
                return 'ok' as const;
            }
        );

        assert.strictEqual(result, 'ok');
        assert.strictEqual(callOptions.length, 1);
    });

    test('retryWithFallbackAuthentication rethrows the error when retry is not allowed', async function () {
        await expectRethrown({ authentication: tokenAuthentication }, authenticationResolution(), 401);
    });

    test('retryWithFallbackAuthentication rethrows non-auth failures even when retry is allowed', async function () {
        await expectRethrown(
            { authentication: tokenAuthentication },
            authenticationResolution({ allowsAutomaticRetry: true }),
            500
        );
    });

    test('retryWithFallbackAuthentication rethrows errors without statusCode unchanged when retry is allowed', async function () {
        const proxiedError = new Proxy(new Error('boom'), {
            has(target, property) {
                return property === 'statusCode' ? false : Reflect.has(target, property);
            },
            get(target, property, receiver) {
                if (property === 'statusCode') {
                    throw new Error('statusCode should not be read when it is absent');
                }

                const reflectedValue: unknown = Reflect.get(target, property, receiver);
                return reflectedValue;
            }
        });

        try {
            await retryWithFallbackAuthentication(
                { authentication: tokenAuthentication },
                authenticationResolution({ allowsAutomaticRetry: true }),
                async function () {
                    throw proxiedError;
                }
            );
            assert.fail('Expected retryWithFallbackAuthentication() to rethrow the original error');
        } catch (error: unknown) {
            assert.strictEqual(error, proxiedError);
        }
    });

    test('retryWithFallbackAuthentication retries with publish auth options on auth failure when retry is allowed', async function () {
        const settings: RegistrySettings = { authentication: tokenAuthentication };
        let attempts = 0;
        const callOptions: NpmFetchOptions[] = [];

        const result = await retryWithFallbackAuthentication(
            settings,
            authenticationResolution({ allowsAutomaticRetry: true }),
            async function ({ options }) {
                callOptions.push(options);
                attempts += 1;
                if (attempts === 1) {
                    throw authenticationFailure(403);
                }
                return 'fallback' as const;
            }
        );

        assert.strictEqual(result, 'fallback');
        assert.strictEqual(attempts, 2);
        assert.deepStrictEqual((callOptions[1] as { readonly forceAuth?: { readonly token?: string; }; }).forceAuth, {
            token: 'abc'
        });
    });

    test('retryWithFallbackAuthentication rethrows when retry is allowed but publish auth is npm-oidc', async function () {
        await expectRethrown(
            { authentication: { type: 'npm-open-identity-connect' } },
            authenticationResolution({ allowsAutomaticRetry: true }),
            401
        );
    });
});
