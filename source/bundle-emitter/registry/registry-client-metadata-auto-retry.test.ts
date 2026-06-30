import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Maybe } from 'true-myth';
import type { PackageVersionDetails } from './package-metadata-fetcher.ts';
import {
    createRetryingMetadataFetch,
    errorWithStatus,
    expectFailure,
    metadataAutoBearerAuth,
    registryClientFactory
} from './registry-client-test-support.ts';

function expectLatestVersion(result: Maybe<PackageVersionDetails>): void {
    assert.deepStrictEqual(
        result,
        Maybe.just({
            version: '1',
            tarballUrl: 'https://registry.example.test/pkg.tgz',
            gitHead: undefined
        })
    );
}

suite('registry-client metadata auto retry', function () {
    test('metadata auto retries with publish auth on a 401 challenge', async function () {
        const npmFetchJson = createRetryingMetadataFetch(401);
        const registryClient = registryClientFactory({ npmFetchJson });

        const result = await registryClient.fetchLatestVersion('the-name', { auth: metadataAutoBearerAuth });

        expectLatestVersion(result);
        assert.strictEqual(npmFetchJson.callCount, 2);
        assert.deepStrictEqual(npmFetchJson.firstCall.args, [
            '/the-name',
            {
                alwaysAuth: true,
                registry: undefined,
                headers: { accept: 'application/vnd.npm.install-v1+json' }
            }
        ]);
        assert.deepStrictEqual(npmFetchJson.secondCall.args, [
            '/the-name',
            {
                alwaysAuth: true,
                registry: undefined,
                forceAuth: { token: 'writer-token' },
                headers: { accept: 'application/vnd.npm.install-v1+json' }
            }
        ]);
    });

    test('metadata auto retries with publish auth on a 403 challenge', async function () {
        const npmFetchJson = createRetryingMetadataFetch(403);
        const registryClient = registryClientFactory({ npmFetchJson });

        const result = await registryClient.fetchLatestVersion('the-name', { auth: metadataAutoBearerAuth });

        expectLatestVersion(result);
        assert.strictEqual(npmFetchJson.callCount, 2);
    });

    test('metadata auto does not retry when the registry returns 404', async function () {
        const npmFetchJson = fake.rejects(errorWithStatus('not found', 404));
        const registryClient = registryClientFactory({ npmFetchJson });

        const result = await registryClient.fetchLatestVersion('the-name', { auth: metadataAutoBearerAuth });

        assert.deepStrictEqual(result, Maybe.nothing());
        assert.strictEqual(npmFetchJson.callCount, 1);
    });

    test('metadata auto does not retry when publish auth uses npm oidc', async function () {
        const npmFetchJson = fake.rejects(errorWithStatus('auth required', 401));
        const registryClient = registryClientFactory({ npmFetchJson });

        await expectFailure(async function () {
            await registryClient.fetchLatestVersion('the-name', {
                auth: {
                    publish: { type: 'npm-oidc', provider: 'env' },
                    metadata: 'auto'
                }
            });
        }, /^Error: auth required$/u);

        assert.strictEqual(npmFetchJson.callCount, 1);
    });

    test('metadata auto does not retry when the registry returns a non-auth error', async function () {
        const npmFetchJson = fake.rejects(errorWithStatus('server error', 500));
        const registryClient = registryClientFactory({ npmFetchJson });

        await expectFailure(async function () {
            await registryClient.fetchLatestVersion('the-name', { auth: metadataAutoBearerAuth });
        }, /^Error: server error$/u);

        assert.strictEqual(npmFetchJson.callCount, 1);
    });

    test('metadata auto rethrows non-object errors without retrying', async function () {
        const npmFetchJson = fake(async function () {
            return new Promise(function (_resolve, reject) {
                Reflect.apply(reject, undefined, [ 'server-error' ]);
            });
        });
        const registryClient = registryClientFactory({ npmFetchJson });

        await expectFailure(async function () {
            await registryClient.fetchLatestVersion('the-name', { auth: metadataAutoBearerAuth });
        }, /^server-error$/u);

        assert.strictEqual(npmFetchJson.callCount, 1);
    });

    test('metadata auto rethrows object errors without statusCode without retrying', async function () {
        const npmFetchJson = fake.rejects(new Error('server-error'));
        const registryClient = registryClientFactory({ npmFetchJson });

        await expectFailure(async function () {
            await registryClient.fetchLatestVersion('the-name', { auth: metadataAutoBearerAuth });
        }, /^Error: server-error$/u);

        assert.strictEqual(npmFetchJson.callCount, 1);
    });
});
