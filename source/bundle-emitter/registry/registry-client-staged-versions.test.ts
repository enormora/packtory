import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import {
    buildStagedVersionsFetchJson,
    registryClientFactory
} from '../../test-libraries/registry-client-test-support.ts';

suite('registry-client staged versions', function () {
    test('fetchStagedVersions() uses authenticated publish auth even when metadata is anonymous', async function () {
        const npmFetchJson = buildStagedVersionsFetchJson([ { items: [ { version: '1.2.4' } ], total: 1 } ]);
        const registryClient = registryClientFactory({ npmFetchJson });

        const result = await registryClient.fetchStagedVersions('the-name', {
            auth: {
                publish: { type: 'bearer-token', token: 'writer-token' },
                metadata: 'anonymous'
            }
        });

        assert.deepStrictEqual(result, [ '1.2.4' ]);
        assert.deepStrictEqual(npmFetchJson.firstCall.args, [
            '/-/stage?package=the-name&page=0&perPage=100',
            {
                alwaysAuth: true,
                registry: undefined,
                forceAuth: { token: 'writer-token' }
            }
        ]);
    });

    test('fetchStagedVersions() collects staged versions across pages', async function () {
        const npmFetchJson = buildStagedVersionsFetchJson([
            { items: [ { version: '1.2.4' } ], total: 2 },
            { items: [ { version: '1.2.5' } ], total: 2 }
        ]);
        const registryClient = registryClientFactory({ npmFetchJson });

        const result = await registryClient.fetchStagedVersions('the-name', {
            auth: { type: 'bearer-token', token: 'writer-token' }
        });

        assert.deepStrictEqual(result, [ '1.2.4', '1.2.5' ]);
        assert.strictEqual(npmFetchJson.callCount, 2);
        assert.strictEqual(npmFetchJson.firstCall.firstArg, '/-/stage?package=the-name&page=0&perPage=100');
        assert.strictEqual(npmFetchJson.secondCall.firstArg, '/-/stage?package=the-name&page=1&perPage=100');
    });

    test('fetchStagedVersions() accepts an empty stage list with total zero', async function () {
        const npmFetchJson = buildStagedVersionsFetchJson([ { items: [], total: 0 } ]);
        const registryClient = registryClientFactory({ npmFetchJson });

        const result = await registryClient.fetchStagedVersions('the-name', {
            auth: { type: 'bearer-token', token: 'writer-token' }
        });

        assert.deepStrictEqual(result, []);
        assert.strictEqual(npmFetchJson.callCount, 1);
    });

    test('fetchStagedVersions() stops fetching when a later page is empty even if the total is larger', async function () {
        const npmFetchJson = buildStagedVersionsFetchJson([
            { items: [ { version: '1.2.4' } ], total: 3 },
            { items: [], total: 3 }
        ]);
        const registryClient = registryClientFactory({ npmFetchJson });

        const result = await registryClient.fetchStagedVersions('the-name', {
            auth: { type: 'bearer-token', token: 'writer-token' }
        });

        assert.deepStrictEqual(result, [ '1.2.4' ]);
        assert.strictEqual(npmFetchJson.callCount, 2);
    });

    test('fetchStagedVersions() requires token-based metadata auth when publish auth uses npm oidc', async function () {
        const npmFetchJson = fake();
        const registryClient = registryClientFactory({ npmFetchJson });

        await assert.rejects(async function () {
            await registryClient.fetchStagedVersions('the-name', {
                auth: {
                    publish: { type: 'npm-oidc', provider: 'env' },
                    metadata: 'auto'
                }
            });
        }, /requires token-based metadata auth/u);

        assert.strictEqual(npmFetchJson.callCount, 0);
    });

    test('fetchStagedVersions() rejects a non-object stage-list response', async function () {
        const registryClient = registryClientFactory({
            npmFetchJson: fake.resolves('invalid-response')
        });

        await assert.rejects(async function () {
            await registryClient.fetchStagedVersions('the-name', {
                auth: { type: 'bearer-token', token: 'writer-token' }
            });
        }, /invalid response from registry stage API/u);
    });

    test('fetchStagedVersions() rejects a null stage-list response', async function () {
        const registryClient = registryClientFactory({
            npmFetchJson: fake.resolves(null)
        });

        await assert.rejects(async function () {
            await registryClient.fetchStagedVersions('the-name', {
                auth: { type: 'bearer-token', token: 'writer-token' }
            });
        }, /invalid response from registry stage API/u);
    });

    test('fetchStagedVersions() rejects a stage-list response with invalid pagination fields', async function () {
        const registryClient = registryClientFactory({
            npmFetchJson: fake.resolves({ items: [], total: '1' })
        });

        await assert.rejects(async function () {
            await registryClient.fetchStagedVersions('the-name', {
                auth: { type: 'bearer-token', token: 'writer-token' }
            });
        }, /invalid response from registry stage API/u);
    });

    test('fetchStagedVersions() rejects a stage-list response with a negative total', async function () {
        const registryClient = registryClientFactory({
            npmFetchJson: fake.resolves({ items: [], total: -1 })
        });

        await assert.rejects(async function () {
            await registryClient.fetchStagedVersions('the-name', {
                auth: { type: 'bearer-token', token: 'writer-token' }
            });
        }, /invalid response from registry stage API/u);
    });

    test('fetchStagedVersions() rejects a stage-list response with an invalid item version', async function () {
        const registryClient = registryClientFactory({
            npmFetchJson: fake.resolves({ items: [ {} ], total: 1 })
        });

        await assert.rejects(async function () {
            await registryClient.fetchStagedVersions('the-name', {
                auth: { type: 'bearer-token', token: 'writer-token' }
            });
        }, /invalid response from registry stage API/u);
    });
});
