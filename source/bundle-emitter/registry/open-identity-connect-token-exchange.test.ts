import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import type { PublishAuthenticationStrategy } from '../../configuration/registry-settings.ts';
import { createFakeClock, type FakeClock } from '../../test-libraries/fake-clock.ts';
import {
    createOpenIdentityConnectTokenExchanger,
    type OpenIdentityConnectTokenExchanger
} from './open-identity-connect-token-exchange.ts';

const npmSettings = { authentication: { type: 'npm-open-identity-connect' } } as const;
const openIdentityConnectAuthentication = { type: 'npm-open-identity-connect' } as const;

type FakeFetchResponseOptions = {
    readonly ok?: boolean;
    readonly status?: number;
    readonly javaScriptObjectNotation: unknown;
};
type FakeFetchResponse = {
    readonly ok: boolean;
    readonly status: number;
    readonly json: () => Promise<unknown>;
};
type OpenIdentityConnectResolveIdentifierToken = (
    authentication: Extract<PublishAuthenticationStrategy, { readonly type: 'npm-open-identity-connect'; }>
) => Promise<string>;
type ExchangerOverrides = {
    readonly fetch?: typeof globalThis.fetch;
    readonly clock?: FakeClock;
    readonly resolveIdentifierToken?: OpenIdentityConnectResolveIdentifierToken;
};

function fakeFetchResponse(overrides: FakeFetchResponseOptions): FakeFetchResponse {
    return {
        ok: overrides.ok ?? true,
        status: overrides.status ?? 201,
        async json() {
            return overrides.javaScriptObjectNotation;
        }
    };
}

function exchangerFactory(overrides: ExchangerOverrides = {}): OpenIdentityConnectTokenExchanger {
    return createOpenIdentityConnectTokenExchanger({
        fetch: overrides.fetch ??
            fake.resolves(
                fakeFetchResponse({
                    javaScriptObjectNotation: {
                        token_type: 'oidc',
                        token: 'exchanged-token',
                        created: '2026-05-06T10:00:00.000Z',
                        expires: '2026-05-06T11:00:00.000Z'
                    }
                }) as unknown as Response
            ),
        clock: overrides.clock ?? createFakeClock({ initialTimestamp: Date.parse('2026-05-06T10:00:00.000Z') }),
        resolveIdentifierToken: overrides.resolveIdentifierToken ?? fake.resolves('upstream-id-token')
    });
}

async function expectExchangeError(
    exchanger: OpenIdentityConnectTokenExchanger,
    expectedMessage: string
): Promise<void> {
    try {
        await exchanger.exchangeToken('package-a', npmSettings, openIdentityConnectAuthentication);
        assert.fail('Expected exchangeToken() to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, expectedMessage);
    }
}

suite('oidc-token-exchange', function () {
    suite('token exchange', function () {
        test('exchangeToken returns the registry token when the OIDC exchange succeeds', async function () {
            const token = await exchangerFactory().exchangeToken(
                'package-a',
                npmSettings,
                openIdentityConnectAuthentication
            );

            assert.strictEqual(token, 'exchanged-token');
        });

        test('exchangeToken caches the token for repeated calls within the refresh threshold', async function () {
            const identifierTokenSpy = fake.resolves('upstream-id-token');
            const exchanger = exchangerFactory({ resolveIdentifierToken: identifierTokenSpy });

            await exchanger.exchangeToken('package-a', npmSettings, openIdentityConnectAuthentication);
            await exchanger.exchangeToken('package-a', npmSettings, openIdentityConnectAuthentication);

            assert.strictEqual(identifierTokenSpy.callCount, 1);
        });

        test('exchangeToken refreshes the token after the cached entry is within the refresh threshold', async function () {
            const identifierTokenSpy = fake.resolves('upstream-id-token');
            const clock = createFakeClock({ initialTimestamp: Date.parse('2026-05-06T10:00:00.000Z') });
            const exchanger = exchangerFactory({ clock, resolveIdentifierToken: identifierTokenSpy });

            await exchanger.exchangeToken('package-a', npmSettings, openIdentityConnectAuthentication);
            clock.tick(Date.parse('2026-05-06T11:00:00.000Z') - Date.parse('2026-05-06T10:00:00.000Z'));
            await exchanger.exchangeToken('package-a', npmSettings, openIdentityConnectAuthentication);

            assert.strictEqual(identifierTokenSpy.callCount, 2);
        });

        test('exchangeToken throws when configured for a non-npm registry', async function () {
            try {
                await exchangerFactory().exchangeToken(
                    'package-a',
                    {
                        registryAddress: 'https://internal.example.com/',
                        authentication: openIdentityConnectAuthentication
                    },
                    openIdentityConnectAuthentication
                );
                assert.fail('Expected exchangeToken() to throw but it did not');
            } catch (error: unknown) {
                assert.strictEqual(
                    (error as Error).message,
                    'npm-oidc auth is only supported with the npmjs.org registry'
                );
            }
        });

        test('exchangeToken throws when the OIDC exchange response status is not ok', async function () {
            await expectExchangeError(
                exchangerFactory({
                    fetch: fake.resolves(
                        fakeFetchResponse({ ok: false, status: 500, javaScriptObjectNotation: {} })
                    ) as unknown as typeof globalThis.fetch
                }),
                'OIDC token exchange failed with status 500'
            );
        });

        test('exchangeToken throws when the OIDC response does not match the expected shape', async function () {
            await expectExchangeError(
                exchangerFactory({
                    fetch: fake.resolves(
                        fakeFetchResponse({ javaScriptObjectNotation: { token_type: 'oidc' } })
                    ) as unknown as typeof globalThis.fetch
                }),
                'OIDC token exchange returned an invalid response: at token: missing property; at expires: missing property'
            );
        });
    });

    suite('response coercion', function () {
        test('exchangeToken accepts an OIDC response that omits token_type and created', async function () {
            const exchanger = exchangerFactory({
                fetch: fake.resolves(
                    fakeFetchResponse({
                        javaScriptObjectNotation: { token: 'exchanged-token', expires: '2026-05-06T11:00:00.000Z' }
                    })
                ) as unknown as typeof globalThis.fetch
            });

            assert.strictEqual(
                await exchanger.exchangeToken('package-a', npmSettings, openIdentityConnectAuthentication),
                'exchanged-token'
            );
        });

        test('exchangeToken accepts an OIDC response with numeric expires and created in seconds', async function () {
            const exchanger = exchangerFactory({
                fetch: fake.resolves(
                    fakeFetchResponse({
                        javaScriptObjectNotation: {
                            token_type: 'oidc',
                            token: 'exchanged-token',
                            created: 1_746_525_600,
                            expires: 1_746_529_200
                        }
                    })
                ) as unknown as typeof globalThis.fetch
            });

            assert.strictEqual(
                await exchanger.exchangeToken('package-a', npmSettings, openIdentityConnectAuthentication),
                'exchanged-token'
            );
        });

        test('exchangeToken accepts an OIDC response with numeric expires in milliseconds', async function () {
            const exchanger = exchangerFactory({
                fetch: fake.resolves(
                    fakeFetchResponse({
                        javaScriptObjectNotation: { token: 'exchanged-token', expires: 1_746_529_200_000 }
                    })
                ) as unknown as typeof globalThis.fetch
            });

            assert.strictEqual(
                await exchanger.exchangeToken('package-a', npmSettings, openIdentityConnectAuthentication),
                'exchanged-token'
            );
        });

        test('exchangeToken throws when the OIDC response expiry cannot be coerced to a date', async function () {
            try {
                await exchangerFactory({
                    fetch: fake.resolves(
                        fakeFetchResponse({
                            javaScriptObjectNotation: { token: 'exchanged-token', expires: 'not-a-date' }
                        })
                    ) as unknown as typeof globalThis.fetch
                })
                    .exchangeToken('package-a', npmSettings, openIdentityConnectAuthentication);
                assert.fail('Expected exchangeToken() to throw but it did not');
            } catch (error: unknown) {
                assert.match(
                    (error as Error).message,
                    /^OIDC token exchange returned an invalid response: .*at expires/u
                );
            }
        });
    });

    suite('write auth options', function () {
        test('resolveWriteAuthenticationOptions returns bearer auth options when publish strategy is bearer-token', async function () {
            const options = await exchangerFactory().resolveWriteAuthenticationOptions('package-a', {
                authentication: { type: 'bearer-token', token: 'static-token' }
            });

            assert.deepStrictEqual((options as { readonly forceAuth: { readonly token: string; }; }).forceAuth, {
                token: 'static-token'
            });
        });

        test('resolveWriteAuthenticationOptions exchanges and returns the OIDC token when publish strategy is npm-oidc', async function () {
            const options = await exchangerFactory().resolveWriteAuthenticationOptions('package-a', npmSettings);

            assert.deepStrictEqual((options as { readonly forceAuth: { readonly token: string; }; }).forceAuth, {
                token: 'exchanged-token'
            });
        });
    });
});
