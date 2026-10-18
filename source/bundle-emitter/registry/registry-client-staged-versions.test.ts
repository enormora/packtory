import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { assertDeepSubset } from '../../test-libraries/deep-subset-assertion.ts';
import {
    buildStagedVersionsFetchJavaScriptObjectNotation,
    registryClientFactory
} from '../../test-libraries/registry-client-test-support.ts';

suite('registry-client staged versions', function () {
    test('fetchStagedVersions() uses authenticated publish auth even when metadata is anonymous', async function () {
        const npmFetchJavaScriptObjectNotation = buildStagedVersionsFetchJavaScriptObjectNotation([ {
            items: [ { version: '1.2.4' } ],
            total: 1
        } ]);
        const registryClient = registryClientFactory({ npmFetchJavaScriptObjectNotation });

        const result = await registryClient.fetchStagedVersions('the-name', {
            authentication: {
                publish: { type: 'bearer-token', token: 'writer-token' },
                metadata: 'anonymous'
            }
        });

        assert.deepStrictEqual(result, [ '1.2.4' ]);
        assert.deepStrictEqual(npmFetchJavaScriptObjectNotation.firstCall.args, [
            '/-/stage?package=the-name&page=0&perPage=100',
            {
                alwaysAuth: true,
                registry: undefined,
                forceAuth: { token: 'writer-token' }
            }
        ]);
    });

    test('fetchStagedVersions() collects staged versions across pages', async function () {
        const npmFetchJavaScriptObjectNotation = buildStagedVersionsFetchJavaScriptObjectNotation([
            { items: [ { version: '1.2.4' } ], total: 2 },
            { items: [ { version: '1.2.5' } ], total: 2 }
        ]);
        const registryClient = registryClientFactory({ npmFetchJavaScriptObjectNotation });

        const result = await registryClient.fetchStagedVersions('the-name', {
            authentication: { type: 'bearer-token', token: 'writer-token' }
        });

        assert.deepStrictEqual(result, [ '1.2.4', '1.2.5' ]);
        assertDeepSubset(npmFetchJavaScriptObjectNotation, {
            callCount: 2,
            firstCall: {
                firstArgument: '/-/stage?package=the-name&page=0&perPage=100'
            },
            secondCall: {
                firstArgument: '/-/stage?package=the-name&page=1&perPage=100'
            }
        });
    });

    test('fetchStagedVersions() accepts an empty stage list with total zero', async function () {
        const npmFetchJavaScriptObjectNotation = buildStagedVersionsFetchJavaScriptObjectNotation([ {
            items: [],
            total: 0
        } ]);
        const registryClient = registryClientFactory({ npmFetchJavaScriptObjectNotation });

        const result = await registryClient.fetchStagedVersions('the-name', {
            authentication: { type: 'bearer-token', token: 'writer-token' }
        });

        assert.deepStrictEqual(result, []);
        assert.strictEqual(npmFetchJavaScriptObjectNotation.callCount, 1);
    });

    test('fetchStagedVersions() stops fetching when a later page is empty even if the total is larger', async function () {
        const npmFetchJavaScriptObjectNotation = buildStagedVersionsFetchJavaScriptObjectNotation([
            { items: [ { version: '1.2.4' } ], total: 3 },
            { items: [], total: 3 }
        ]);
        const registryClient = registryClientFactory({ npmFetchJavaScriptObjectNotation });

        const result = await registryClient.fetchStagedVersions('the-name', {
            authentication: { type: 'bearer-token', token: 'writer-token' }
        });

        assert.deepStrictEqual(result, [ '1.2.4' ]);
        assert.strictEqual(npmFetchJavaScriptObjectNotation.callCount, 2);
    });

    test('fetchStagedVersions() requires token-based metadata auth when publish auth uses npm oidc', async function () {
        const npmFetchJavaScriptObjectNotation = fake();
        const registryClient = registryClientFactory({ npmFetchJavaScriptObjectNotation });

        await assert.rejects(async function () {
            await registryClient.fetchStagedVersions('the-name', {
                authentication: {
                    publish: { type: 'npm-open-identity-connect', provider: 'environment' },
                    metadata: 'automatic'
                }
            });
        }, /requires token-based metadata auth/u);

        assert.strictEqual(npmFetchJavaScriptObjectNotation.callCount, 0);
    });

    test('fetchStagedVersions() rejects a non-object stage-list response', async function () {
        const registryClient = registryClientFactory({
            npmFetchJavaScriptObjectNotation: fake.resolves('invalid-response')
        });

        await assert.rejects(async function () {
            await registryClient.fetchStagedVersions('the-name', {
                authentication: { type: 'bearer-token', token: 'writer-token' }
            });
        }, /invalid response from registry stage API/u);
    });

    test('fetchStagedVersions() rejects a null stage-list response', async function () {
        const registryClient = registryClientFactory({
            npmFetchJavaScriptObjectNotation: fake.resolves(null)
        });

        await assert.rejects(async function () {
            await registryClient.fetchStagedVersions('the-name', {
                authentication: { type: 'bearer-token', token: 'writer-token' }
            });
        }, /invalid response from registry stage API/u);
    });

    test('fetchStagedVersions() rejects a stage-list response with invalid pagination fields', async function () {
        const registryClient = registryClientFactory({
            npmFetchJavaScriptObjectNotation: fake.resolves({ items: [], total: '1' })
        });

        await assert.rejects(async function () {
            await registryClient.fetchStagedVersions('the-name', {
                authentication: { type: 'bearer-token', token: 'writer-token' }
            });
        }, /invalid response from registry stage API/u);
    });

    test('fetchStagedVersions() rejects a stage-list response with a negative total', async function () {
        const registryClient = registryClientFactory({
            npmFetchJavaScriptObjectNotation: fake.resolves({ items: [], total: -1 })
        });

        await assert.rejects(async function () {
            await registryClient.fetchStagedVersions('the-name', {
                authentication: { type: 'bearer-token', token: 'writer-token' }
            });
        }, /invalid response from registry stage API/u);
    });

    test('fetchStagedVersions() rejects a stage-list response with an invalid item version', async function () {
        const registryClient = registryClientFactory({
            npmFetchJavaScriptObjectNotation: fake.resolves({ items: [ {} ], total: 1 })
        });

        await assert.rejects(async function () {
            await registryClient.fetchStagedVersions('the-name', {
                authentication: { type: 'bearer-token', token: 'writer-token' }
            });
        }, /invalid response from registry stage API/u);
    });
});
