import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { createFakeClock } from '../../test-libraries/fake-clock.ts';
import {
    createOidcExchangeFetch,
    getPublishedToken,
    npmOidcRegistrySettings,
    publishWithNpmOidc,
    registryClientFactory,
    requireFetchSpy
} from './registry-client-test-support.ts';

function expectOidcExchange(fetchSpy: SinonSpy, packageName = '@scope/the-name'): void {
    const registryPackagePath = packageName.replace('/', '%2F');
    assert.deepStrictEqual(fetchSpy.firstCall.args, [
        `https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/${registryPackagePath}`,
        {
            method: 'POST',
            headers: { Authorization: 'Bearer upstream-id-token' }
        }
    ]);
}

suite('registry-client oidc success', function () {
    test('publishPackage() resolves and exchanges npm oidc id tokens', async function () {
        const publish = fake.resolves(undefined);
        const resolveIdToken = fake.resolves('upstream-id-token');
        const fetchFunction = createOidcExchangeFetch();
        const registryClient = registryClientFactory({ publish, fetch: fetchFunction, resolveIdToken });

        await registryClient.publishPackage(
            { name: '@scope/the-name', version: '1.0.0' },
            Buffer.from([]),
            {
                auth: {
                    publish: { type: 'npm-oidc', provider: 'github-actions' },
                    metadata: 'anonymous'
                }
            },
            { access: 'public' },
            false
        );

        assert.deepStrictEqual(resolveIdToken.firstCall.args, [ { type: 'npm-oidc', provider: 'github-actions' } ]);
        expectOidcExchange(requireFetchSpy(fetchFunction));
        assert.strictEqual(getPublishedToken(publish), 'oidc-exchange-token');
    });

    test('publishPackage() exchanges npm oidc tokens and caches the exchange token per package', async function () {
        const publish = fake.resolves(undefined);
        const fetchFunction = createOidcExchangeFetch();
        const registryClient = registryClientFactory({
            publish,
            fetch: fetchFunction,
            clock: createFakeClock({ initialTimestamp: Date.parse('2026-05-06T10:00:00.000Z') }),
            resolveIdToken: fake.resolves('upstream-id-token')
        });

        await publishWithNpmOidc(registryClient);
        await publishWithNpmOidc(registryClient, { name: '@scope/the-name', version: '1.0.1' });

        const fetchSpy = requireFetchSpy(fetchFunction);
        assert.strictEqual(fetchSpy.callCount, 1);
        expectOidcExchange(fetchSpy);
        assert.strictEqual(getPublishedToken(publish), 'oidc-exchange-token');
        assert.strictEqual(getPublishedToken(publish, 1), 'oidc-exchange-token');
    });

    test('publishPackage() passes shorthand npm oidc auth through to the id token resolver', async function () {
        const publish = fake.resolves(undefined);
        const resolveIdToken = fake.resolves('upstream-id-token');
        const registryClient = registryClientFactory({ publish, fetch: createOidcExchangeFetch(), resolveIdToken });

        await registryClient.publishPackage(
            { name: 'the-name', version: '1.0.0' },
            Buffer.from([]),
            { auth: { type: 'npm-oidc' } },
            { access: 'public' },
            false
        );

        assert.deepStrictEqual(resolveIdToken.firstCall.args, [ { type: 'npm-oidc' } ]);
        assert.strictEqual(getPublishedToken(publish), 'oidc-exchange-token');
    });

    test('publishPackage() refreshes the exchanged npm oidc token after expiry', async function () {
        const clock = createFakeClock({ initialTimestamp: Date.parse('2026-05-06T10:00:00.000Z') });
        const fetchFunction = createOidcExchangeFetch({ expires: '2026-05-06T10:01:00.000Z' });
        const registryClient = registryClientFactory({
            publish: fake.resolves(undefined),
            fetch: fetchFunction,
            clock,
            resolveIdToken: fake.resolves('upstream-id-token')
        });

        await publishWithNpmOidc(registryClient);
        clock.tick(61_000);
        await publishWithNpmOidc(registryClient, { name: '@scope/the-name', version: '1.0.1' });

        assert.strictEqual(requireFetchSpy(fetchFunction).callCount, 2);
    });

    test('publishPackage() refreshes the exchanged npm oidc token when exactly 60 seconds remain', async function () {
        const fetchFunction = createOidcExchangeFetch({ expires: '2026-05-06T10:01:00.000Z' });
        const registryClient = registryClientFactory({
            publish: fake.resolves(undefined),
            fetch: fetchFunction,
            clock: createFakeClock({ initialTimestamp: Date.parse('2026-05-06T10:00:00.000Z') }),
            resolveIdToken: fake.resolves('upstream-id-token')
        });

        await publishWithNpmOidc(registryClient);
        await publishWithNpmOidc(registryClient, { name: '@scope/the-name', version: '1.0.1' });

        assert.strictEqual(requireFetchSpy(fetchFunction).callCount, 2);
    });

    test('publishPackage() caches exchanged npm oidc tokens per package name', async function () {
        const fetchFunction = createOidcExchangeFetch();
        const registryClient = registryClientFactory({
            publish: fake.resolves(undefined),
            fetch: fetchFunction,
            resolveIdToken: fake.resolves('upstream-id-token')
        });

        await publishWithNpmOidc(registryClient, { name: '@scope/first-package', version: '1.0.0' });
        await publishWithNpmOidc(registryClient, { name: '@scope/second-package', version: '1.0.0' });

        const fetchSpy = requireFetchSpy(fetchFunction);
        assert.strictEqual(fetchSpy.callCount, 2);
        expectOidcExchange(fetchSpy, '@scope/first-package');
        assert.deepStrictEqual(fetchSpy.secondCall.args, [
            'https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/@scope%2Fsecond-package',
            {
                method: 'POST',
                headers: { Authorization: 'Bearer upstream-id-token' }
            }
        ]);
    });

    test('publishPackage() reuses exchanged npm oidc tokens between implicit and explicit npm registry URLs', async function () {
        const fetchFunction = createOidcExchangeFetch();
        const registryClient = registryClientFactory({
            publish: fake.resolves(undefined),
            fetch: fetchFunction,
            resolveIdToken: fake.resolves('upstream-id-token')
        });

        await publishWithNpmOidc(registryClient);
        await publishWithNpmOidc(
            registryClient,
            { name: '@scope/the-name', version: '1.0.1' },
            npmOidcRegistrySettings({ registryUrl: 'https://registry.npmjs.org/' })
        );

        assert.strictEqual(requireFetchSpy(fetchFunction).callCount, 1);
    });
});
