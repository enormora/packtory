import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Maybe } from 'true-myth';
import { assertDeepSubset } from '../../test-libraries/deep-subset-assertion.ts';
import {
    createRetryingMetadataFetch,
    errorWithStatus,
    expectFailure,
    metadataAutomaticBearerAuthentication,
    registryClientFactory
} from '../../test-libraries/registry-client-test-support.ts';
import type { PackageVersionDetails } from './package-metadata-fetcher.ts';

const emptyTarballIntegrity = { integrity: undefined, shasum: undefined } as const;

function expectLatestVersion(result: Maybe<PackageVersionDetails>): void {
    assert.deepStrictEqual(
        result,
        Maybe.just({
            version: '1',
            tarballAddress: 'https://registry.example.test/pkg.tgz',
            tarballIntegrity: emptyTarballIntegrity,
            gitHead: undefined
        })
    );
}

suite('registry-client metadata auto retry', function () {
    test('metadata auto retries with publish auth on a 401 challenge', async function () {
        const npmFetchJavaScriptObjectNotation = createRetryingMetadataFetch(401);
        const registryClient = registryClientFactory({ npmFetchJavaScriptObjectNotation });

        const result = await registryClient.fetchLatestVersion('the-name', {
            authentication: metadataAutomaticBearerAuthentication
        });

        expectLatestVersion(result);
        assertDeepSubset(npmFetchJavaScriptObjectNotation, {
            callCount: 2,
            firstCall: {
                arguments: [
                    '/the-name',
                    {
                        alwaysAuth: true,
                        registry: undefined,
                        headers: { accept: 'application/vnd.npm.install-v1+json' }
                    }
                ]
            },
            secondCall: {
                arguments: [
                    '/the-name',
                    {
                        alwaysAuth: true,
                        registry: undefined,
                        forceAuth: { token: 'writer-token' },
                        headers: { accept: 'application/vnd.npm.install-v1+json' }
                    }
                ]
            }
        });
    });

    test('metadata auto retries with publish auth on a 403 challenge', async function () {
        const npmFetchJavaScriptObjectNotation = createRetryingMetadataFetch(403);
        const registryClient = registryClientFactory({ npmFetchJavaScriptObjectNotation });

        const result = await registryClient.fetchLatestVersion('the-name', {
            authentication: metadataAutomaticBearerAuthentication
        });

        expectLatestVersion(result);
        assert.strictEqual(npmFetchJavaScriptObjectNotation.callCount, 2);
    });

    test('metadata auto does not retry when the registry returns 404', async function () {
        const npmFetchJavaScriptObjectNotation = fake.rejects(errorWithStatus('not found', 404));
        const registryClient = registryClientFactory({ npmFetchJavaScriptObjectNotation });

        const result = await registryClient.fetchLatestVersion('the-name', {
            authentication: metadataAutomaticBearerAuthentication
        });

        assert.deepStrictEqual(result, Maybe.nothing());
        assert.strictEqual(npmFetchJavaScriptObjectNotation.callCount, 1);
    });

    test('metadata auto does not retry when publish auth uses npm oidc', async function () {
        const npmFetchJavaScriptObjectNotation = fake.rejects(errorWithStatus('auth required', 401));
        const registryClient = registryClientFactory({ npmFetchJavaScriptObjectNotation });

        await expectFailure(async function () {
            await registryClient.fetchLatestVersion('the-name', {
                authentication: {
                    publish: { type: 'npm-open-identity-connect', provider: 'environment' },
                    metadata: 'automatic'
                }
            });
        }, /^Error: auth required$/u);

        assert.strictEqual(npmFetchJavaScriptObjectNotation.callCount, 1);
    });

    test('metadata auto does not retry when the registry returns a non-auth error', async function () {
        const npmFetchJavaScriptObjectNotation = fake.rejects(errorWithStatus('server error', 500));
        const registryClient = registryClientFactory({ npmFetchJavaScriptObjectNotation });

        await expectFailure(async function () {
            await registryClient.fetchLatestVersion('the-name', {
                authentication: metadataAutomaticBearerAuthentication
            });
        }, /^Error: server error$/u);

        assert.strictEqual(npmFetchJavaScriptObjectNotation.callCount, 1);
    });

    test('metadata auto rethrows non-object errors without retrying', async function () {
        const npmFetchJavaScriptObjectNotation = fake(async function () {
            return new Promise(function (_resolve, reject) {
                Reflect.apply(reject, undefined, [ 'server-error' ]);
            });
        });
        const registryClient = registryClientFactory({ npmFetchJavaScriptObjectNotation });

        await expectFailure(async function () {
            await registryClient.fetchLatestVersion('the-name', {
                authentication: metadataAutomaticBearerAuthentication
            });
        }, /^server-error$/u);

        assert.strictEqual(npmFetchJavaScriptObjectNotation.callCount, 1);
    });

    test('metadata auto rethrows object errors without statusCode without retrying', async function () {
        const npmFetchJavaScriptObjectNotation = fake.rejects(new Error('server-error'));
        const registryClient = registryClientFactory({ npmFetchJavaScriptObjectNotation });

        await expectFailure(async function () {
            await registryClient.fetchLatestVersion('the-name', {
                authentication: metadataAutomaticBearerAuthentication
            });
        }, /^Error: server-error$/u);

        assert.strictEqual(npmFetchJavaScriptObjectNotation.callCount, 1);
    });
});
