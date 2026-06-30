import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { RegistrySettings } from '../../config/registry-settings.ts';
import type { AuthResolution, NpmFetchOptions } from './registry-auth-config.ts';
import { retryWithFallbackAuth } from './metadata-auth-retry.ts';

const tokenAuth = { type: 'bearer-token', token: 'abc' } as const;

function authResolution(overrides: Partial<AuthResolution> = {}): AuthResolution {
    return {
        allowsAutomaticRetry: false,
        registry: undefined,
        options: { alwaysAuth: true, registry: undefined },
        ...overrides
    };
}

function authFailure(statusCode: number): Error & { readonly statusCode: number; } {
    return Object.assign(new Error(`HTTP ${statusCode}`), { statusCode });
}

async function expectRethrown(
    settings: RegistrySettings,
    resolution: AuthResolution,
    statusCode: number
): Promise<void> {
    try {
        await retryWithFallbackAuth(settings, resolution, async function () {
            throw authFailure(statusCode);
        });
        assert.fail('Expected retryWithFallbackAuth() to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as { readonly statusCode: number; }).statusCode, statusCode);
    }
}

suite('metadata-auth-retry', function () {
    test('retryWithFallbackAuth returns the run() result when it succeeds on the first attempt', async function () {
        const callOptions: NpmFetchOptions[] = [];

        const result = await retryWithFallbackAuth({ auth: tokenAuth }, authResolution(), async function (options) {
            callOptions.push(options);
            return 'ok' as const;
        });

        assert.strictEqual(result, 'ok');
        assert.strictEqual(callOptions.length, 1);
    });

    test('retryWithFallbackAuth rethrows the error when retry is not allowed', async function () {
        await expectRethrown({ auth: tokenAuth }, authResolution(), 401);
    });

    test('retryWithFallbackAuth rethrows non-auth failures even when retry is allowed', async function () {
        await expectRethrown({ auth: tokenAuth }, authResolution({ allowsAutomaticRetry: true }), 500);
    });

    test('retryWithFallbackAuth rethrows errors without statusCode unchanged when retry is allowed', async function () {
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
            await retryWithFallbackAuth(
                { auth: tokenAuth },
                authResolution({ allowsAutomaticRetry: true }),
                async function () {
                    throw proxiedError;
                }
            );
            assert.fail('Expected retryWithFallbackAuth() to rethrow the original error');
        } catch (error: unknown) {
            assert.strictEqual(error, proxiedError);
        }
    });

    test('retryWithFallbackAuth retries with publish auth options on auth failure when retry is allowed', async function () {
        const settings: RegistrySettings = { auth: tokenAuth };
        let attempts = 0;
        const callOptions: NpmFetchOptions[] = [];

        const result = await retryWithFallbackAuth(
            settings,
            authResolution({ allowsAutomaticRetry: true }),
            async function (options) {
                callOptions.push(options);
                attempts += 1;
                if (attempts === 1) {
                    throw authFailure(403);
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

    test('retryWithFallbackAuth rethrows when retry is allowed but publish auth is npm-oidc', async function () {
        await expectRethrown({ auth: { type: 'npm-oidc' } }, authResolution({ allowsAutomaticRetry: true }), 401);
    });
});
