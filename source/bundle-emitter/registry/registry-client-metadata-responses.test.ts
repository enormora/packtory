import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Maybe } from 'true-myth';
import { throwNonError } from '../../test-libraries/non-error-failures.ts';
import { expectFailure, registryClientFactory } from '../../test-libraries/registry-client-test-support.ts';

function fetchErrorWithStatusCode(statusCode: number): Error & { readonly statusCode: number; } {
    return Object.assign(new Error('fetch-error'), { statusCode });
}

suite('registry-client metadata responses', function () {
    test('fetchLatestVersion() returns nothing for 404 responses', async function () {
        const error = fetchErrorWithStatusCode(404);
        const registryClient = registryClientFactory({ npmFetchJson: fake.rejects(error) });

        const result = await registryClient.fetchLatestVersion('the-name', {
            auth: { type: 'bearer-token', token: 'the-token' }
        });

        assert.deepStrictEqual(result, Maybe.nothing());
    });

    test('fetchLatestVersion() rethrows 403 responses', async function () {
        const registryClient = registryClientFactory({ npmFetchJson: fake.rejects(fetchErrorWithStatusCode(403)) });

        await expectFailure(async function () {
            await registryClient.fetchLatestVersion('the-name', {
                auth: { type: 'bearer-token', token: 'the-token' }
            });
        }, /^Error: fetch-error$/u);
    });

    test('fetchLatestVersion() throws on invalid registry payloads', async function () {
        const registryClient = registryClientFactory({
            npmFetchJson: fake.resolves({ invalid: 'response-data' })
        });

        await expectFailure(async function () {
            await registryClient.fetchLatestVersion('the-name', {
                auth: { type: 'bearer-token', token: 'the-token' }
            });
        }, /^Error: Got an invalid response from registry API$/u);
    });

    test('fetchLatestVersion() throws on invalid non-object registry payloads', async function () {
        const registryClient = registryClientFactory({
            npmFetchJson: fake.resolves('invalid-response')
        });

        await expectFailure(async function () {
            await registryClient.fetchLatestVersion('the-name', {
                auth: { type: 'bearer-token', token: 'the-token' }
            });
        }, /^Error: Got an invalid response from registry API$/u);
    });

    test('fetchLatestVersion() returns nothing when the registry response has no latest tag', async function () {
        const registryClient = registryClientFactory({
            npmFetchJson: fake.resolves({
                name: 'the-name',
                'dist-tags': {},
                versions: { '1.0.0': { dist: { tarball: 'https://registry.example.test/pkg.tgz' } } }
            })
        });

        const result = await registryClient.fetchLatestVersion('the-name', {
            auth: { type: 'bearer-token', token: 'the-token' }
        });

        assert.deepStrictEqual(result, Maybe.nothing());
    });

    test('fetchLatestVersion() throws when the latest tag points to a missing version entry', async function () {
        const registryClient = registryClientFactory({
            npmFetchJson: fake.resolves({
                name: 'the-name',
                'dist-tags': { latest: '1.0.0' },
                versions: {}
            })
        });

        await expectFailure(async function () {
            await registryClient.fetchLatestVersion('the-name', {
                auth: { type: 'bearer-token', token: 'the-token' }
            });
        }, /^Error: Version "1.0.0" for package "the-name" has no entry in the registry response$/u);
    });

    suite('fetchLatestVersion invalid registry payloads', function () {
        for (
            const [ testName, response ] of [
                [ 'response is not an object', 'invalid-response' ],
                [ 'dist-tags is not an object', { name: 'the-name', 'dist-tags': 'invalid', versions: {} } ],
                [ 'dist-tags latest is not a string', { name: 'the-name', 'dist-tags': { latest: 1 }, versions: {} } ],
                [ 'versions is not an object', { name: 'the-name', 'dist-tags': {}, versions: 'invalid' } ],
                [
                    'version dist is missing',
                    { name: 'the-name', 'dist-tags': { latest: '1.0.0' }, versions: { '1.0.0': {} } }
                ],
                [
                    'version tarball is not a string',
                    {
                        name: 'the-name',
                        'dist-tags': { latest: '1.0.0' },
                        versions: { '1.0.0': { dist: { tarball: false } } }
                    }
                ]
            ] as const
        ) {
            test(`fetchLatestVersion() rejects invalid registry payloads when ${testName}`, async function () {
                const registryClient = registryClientFactory({
                    npmFetchJson: fake.resolves(response)
                });

                await expectFailure(async function () {
                    await registryClient.fetchLatestVersion('the-name', {
                        auth: { type: 'bearer-token', token: 'the-token' }
                    });
                }, /^Error: Got an invalid response from registry API$/u);
            });
        }
    });

    test('fetchLatestVersion() rejects null versions payloads', async function () {
        const registryClient = registryClientFactory({
            npmFetchJson: fake.resolves({
                name: 'the-name',
                'dist-tags': { latest: '1.0.0' },
                versions: null
            })
        });

        await expectFailure(async function () {
            await registryClient.fetchLatestVersion('the-name', {
                auth: { type: 'bearer-token', token: 'the-token' }
            });
        }, /^Error: Got an invalid response from registry API$/u);
    });

    test('fetchLatestVersion() rethrows non-object unexpected errors', async function () {
        const registryClient = registryClientFactory({
            npmFetchJson: fake(async function () {
                throwNonError('unexpected-failure');
            })
        });

        await expectFailure(async function () {
            await registryClient.fetchLatestVersion('the-name', {
                auth: { type: 'bearer-token', token: 'the-token' }
            });
        }, /^unexpected-failure$/u);
    });

    test('fetchLatestVersion() rethrows object unexpected errors without statusCode', async function () {
        const registryClient = registryClientFactory({
            npmFetchJson: fake.rejects(new Error('unexpected-failure'))
        });

        await expectFailure(async function () {
            await registryClient.fetchLatestVersion('the-name', {
                auth: { type: 'bearer-token', token: 'the-token' }
            });
        }, /^Error: unexpected-failure$/u);
    });
});
