import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import type { PublishAuthStrategy } from '../../config/registry-settings.ts';
import { createFakeClock } from '../../test-libraries/fake-clock.ts';
import { createOidcTokenExchanger } from './oidc-token-exchange.ts';

const npmSettings = { auth: { type: 'npm-oidc' } } as const;
const oidcAuth = { type: 'npm-oidc' } as const;

function fakeFetchResponse(overrides: { readonly ok?: boolean; readonly status?: number; readonly json: unknown }): {
    readonly ok: boolean;
    readonly status: number;
    readonly json: () => Promise<unknown>;
} {
    return {
        ok: overrides.ok ?? true,
        status: overrides.status ?? 201,
        json: async () => overrides.json
    };
}

function exchangerFactory(
    overrides: {
        readonly fetch?: typeof globalThis.fetch;
        readonly clock?: ReturnType<typeof createFakeClock>;
        readonly resolveIdToken?: (auth: Extract<PublishAuthStrategy, { type: 'npm-oidc' }>) => Promise<string>;
    } = {}
): ReturnType<typeof createOidcTokenExchanger> {
    return createOidcTokenExchanger({
        fetch:
            overrides.fetch ??
            (fake.resolves(
                fakeFetchResponse({
                    json: {
                        token_type: 'oidc',
                        token: 'exchanged-token',
                        created: '2026-05-06T10:00:00.000Z',
                        expires: '2026-05-06T11:00:00.000Z'
                    }
                })
            ) as unknown as typeof globalThis.fetch),
        clock: overrides.clock ?? createFakeClock({ initialTimestamp: Date.parse('2026-05-06T10:00:00.000Z') }),
        resolveIdToken: overrides.resolveIdToken ?? fake.resolves('upstream-id-token')
    });
}

async function expectExchangeError(
    exchanger: ReturnType<typeof exchangerFactory>,
    expectedMessage: string
): Promise<void> {
    try {
        await exchanger.exchangeToken('pkg-a', npmSettings, oidcAuth);
        assert.fail('Expected exchangeToken() to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, expectedMessage);
    }
}

suite('oidc-token-exchange', function () {
    test('exchangeToken returns the registry token when the OIDC exchange succeeds', async function () {
        const token = await exchangerFactory().exchangeToken('pkg-a', npmSettings, oidcAuth);

        assert.strictEqual(token, 'exchanged-token');
    });

    test('exchangeToken caches the token for repeated calls within the refresh threshold', async function () {
        const idTokenSpy = fake.resolves('upstream-id-token');
        const exchanger = exchangerFactory({ resolveIdToken: idTokenSpy });

        await exchanger.exchangeToken('pkg-a', npmSettings, oidcAuth);
        await exchanger.exchangeToken('pkg-a', npmSettings, oidcAuth);

        assert.strictEqual(idTokenSpy.callCount, 1);
    });

    test('exchangeToken refreshes the token after the cached entry is within the refresh threshold', async function () {
        const idTokenSpy = fake.resolves('upstream-id-token');
        const clock = createFakeClock({ initialTimestamp: Date.parse('2026-05-06T10:00:00.000Z') });
        const exchanger = exchangerFactory({ clock, resolveIdToken: idTokenSpy });

        await exchanger.exchangeToken('pkg-a', npmSettings, oidcAuth);
        clock.tick(Date.parse('2026-05-06T11:00:00.000Z') - Date.parse('2026-05-06T10:00:00.000Z'));
        await exchanger.exchangeToken('pkg-a', npmSettings, oidcAuth);

        assert.strictEqual(idTokenSpy.callCount, 2);
    });

    test('exchangeToken throws when configured for a non-npm registry', async function () {
        try {
            await exchangerFactory().exchangeToken(
                'pkg-a',
                { registryUrl: 'https://internal.example.com/', auth: oidcAuth },
                oidcAuth
            );
            assert.fail('Expected exchangeToken() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'npm-oidc auth is only supported with the npmjs.org registry');
        }
    });

    test('exchangeToken throws when the OIDC exchange response status is not ok', async function () {
        await expectExchangeError(
            exchangerFactory({
                fetch: fake.resolves(
                    fakeFetchResponse({ ok: false, status: 500, json: {} })
                ) as unknown as typeof globalThis.fetch
            }),
            'OIDC token exchange failed with status 500'
        );
    });

    test('exchangeToken throws when the OIDC response does not match the expected shape', async function () {
        await expectExchangeError(
            exchangerFactory({
                fetch: fake.resolves(
                    fakeFetchResponse({ json: { token_type: 'oidc' } })
                ) as unknown as typeof globalThis.fetch
            }),
            'OIDC token exchange returned an invalid response: at token: missing property; at expires: missing property'
        );
    });

    test('exchangeToken accepts an OIDC response that omits token_type and created', async function () {
        const exchanger = exchangerFactory({
            fetch: fake.resolves(
                fakeFetchResponse({
                    json: { token: 'exchanged-token', expires: '2026-05-06T11:00:00.000Z' }
                })
            ) as unknown as typeof globalThis.fetch
        });

        assert.strictEqual(await exchanger.exchangeToken('pkg-a', npmSettings, oidcAuth), 'exchanged-token');
    });

    test('exchangeToken accepts an OIDC response with numeric expires and created in seconds', async function () {
        const exchanger = exchangerFactory({
            fetch: fake.resolves(
                fakeFetchResponse({
                    json: {
                        token_type: 'oidc',
                        token: 'exchanged-token',
                        created: 1_746_525_600,
                        expires: 1_746_529_200
                    }
                })
            ) as unknown as typeof globalThis.fetch
        });

        assert.strictEqual(await exchanger.exchangeToken('pkg-a', npmSettings, oidcAuth), 'exchanged-token');
    });

    test('exchangeToken accepts an OIDC response with numeric expires in milliseconds', async function () {
        const exchanger = exchangerFactory({
            fetch: fake.resolves(
                fakeFetchResponse({
                    json: { token: 'exchanged-token', expires: 1_746_529_200_000 }
                })
            ) as unknown as typeof globalThis.fetch
        });

        assert.strictEqual(await exchanger.exchangeToken('pkg-a', npmSettings, oidcAuth), 'exchanged-token');
    });

    test('exchangeToken throws when the OIDC response expiry cannot be coerced to a date', async function () {
        try {
            await exchangerFactory({
                fetch: fake.resolves(
                    fakeFetchResponse({
                        json: { token: 'exchanged-token', expires: 'not-a-date' }
                    })
                ) as unknown as typeof globalThis.fetch
            }).exchangeToken('pkg-a', npmSettings, oidcAuth);
            assert.fail('Expected exchangeToken() to throw but it did not');
        } catch (error: unknown) {
            assert.match((error as Error).message, /^OIDC token exchange returned an invalid response: .*at expires/u);
        }
    });

    test('resolveWriteAuthOptions returns bearer auth options when publish strategy is bearer-token', async function () {
        const options = await exchangerFactory().resolveWriteAuthOptions('pkg-a', {
            auth: { type: 'bearer-token', token: 'static-token' }
        });

        assert.deepStrictEqual((options as { forceAuth: { token: string } }).forceAuth, { token: 'static-token' });
    });

    test('resolveWriteAuthOptions exchanges and returns the OIDC token when publish strategy is npm-oidc', async function () {
        const options = await exchangerFactory().resolveWriteAuthOptions('pkg-a', npmSettings);

        assert.deepStrictEqual((options as { forceAuth: { token: string } }).forceAuth, { token: 'exchanged-token' });
    });
});
