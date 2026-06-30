import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import {
    createOidcExchangeFetch,
    npmOidcRegistrySettings,
    publishWithNpmOidc,
    registryClientFactory
} from './registry-client-test-support.ts';

suite('registry-client oidc failures', function () {
    test('publishPackage() rejects npm oidc auth for non-npm registries', async function () {
        const registryClient = registryClientFactory({ resolveIdToken: fake.resolves('upstream-id-token') });

        await assert.rejects(async function () {
            await publishWithNpmOidc(
                registryClient,
                { name: 'the-name', version: '1.0.0' },
                npmOidcRegistrySettings({ registryUrl: 'https://registry.example.test' })
            );
        }, /^Error: npm-oidc auth is only supported with the npmjs.org registry$/u);
    });

    for (
        const [ testName, response ] of [
            [ 'fields are missing', { token: 'missing-fields' } ],
            [ 'body is a string', 'invalid-response' ],
            [ 'body is null', null ],
            [ 'token is the wrong shape', { token: 123, expires: '2026-05-06T11:00:00.000Z' } ],
            [ 'expires cannot be coerced to a date', { token: 'oidc-exchange-token', expires: 'not-a-date' } ],
            [ 'expires is the wrong shape', { token: 'oidc-exchange-token', expires: {} } ]
        ] as const
    ) {
        test(`publishPackage() rejects an OIDC exchange response when ${testName}`, async function () {
            const registryClient = registryClientFactory({
                fetch: createOidcExchangeFetch({ response }),
                resolveIdToken: fake.resolves('upstream-id-token')
            });

            await assert.rejects(async function () {
                await publishWithNpmOidc(registryClient, { name: 'the-name', version: '1.0.0' });
            }, /^TypeError: OIDC token exchange returned an invalid response: /u);
        });
    }

    test('publishPackage() rejects a failing OIDC exchange request', async function () {
        const registryClient = registryClientFactory({
            fetch: createOidcExchangeFetch({ ok: false, status: 502, response: {} }),
            resolveIdToken: fake.resolves('upstream-id-token')
        });

        await assert.rejects(async function () {
            await publishWithNpmOidc(registryClient, { name: 'the-name', version: '1.0.0' });
        }, /^Error: OIDC token exchange failed with status 502$/u);
    });
});
