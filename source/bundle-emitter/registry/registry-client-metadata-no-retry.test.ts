import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { assertDeepSubset } from '../../test-libraries/deep-subset-assertion.ts';
import {
    errorWithStatus,
    expectFailure,
    registryClientFactory
} from '../../test-libraries/registry-client-test-support.ts';

const emptyTarballIntegrity = { integrity: undefined, shasum: undefined } as const;

suite('registry-client metadata no retry', function () {
    test('metadata using inherited publish auth does not retry on a 401 challenge', async function () {
        const error = errorWithStatus('auth required', 401);
        const npmFetchJavaScriptObjectNotation = fake.rejects(error);
        const registryClient = registryClientFactory({ npmFetchJavaScriptObjectNotation });

        await expectFailure(async function () {
            await registryClient.fetchLatestVersion('the-name', {
                authentication: { type: 'bearer-token', token: 'writer-token' }
            });
        }, /^Error: auth required$/u);

        assert.strictEqual(npmFetchJavaScriptObjectNotation.callCount, 1);
    });

    test('anonymous metadata access does not retry on a 401 challenge', async function () {
        const error = errorWithStatus('auth required', 401);
        const npmFetchJavaScriptObjectNotation = fake.rejects(error);
        const registryClient = registryClientFactory({ npmFetchJavaScriptObjectNotation });

        await expectFailure(async function () {
            await registryClient.fetchLatestVersion('the-name', {
                authentication: {
                    publish: { type: 'bearer-token', token: 'writer-token' },
                    metadata: 'anonymous'
                }
            });
        }, /^Error: auth required$/u);

        assert.strictEqual(npmFetchJavaScriptObjectNotation.callCount, 1);
    });

    test('basic metadata auth does not retry on a 401 challenge', async function () {
        const error = errorWithStatus('auth required', 401);
        const npmFetchJavaScriptObjectNotation = fake.rejects(error);
        const registryClient = registryClientFactory({ npmFetchJavaScriptObjectNotation });

        await expectFailure(async function () {
            await registryClient.fetchLatestVersion('the-name', {
                authentication: {
                    publish: { type: 'bearer-token', token: 'writer-token' },
                    metadata: { type: 'basic', username: 'reader', password: 'reader-secret' }
                }
            });
        }, /^Error: auth required$/u);

        assert.strictEqual(npmFetchJavaScriptObjectNotation.callCount, 1);
    });

    test('fetchTarball() also retries metadata auto with publish auth on a 401 challenge', async function () {
        let callCount = 0;
        const fetchImplementation = fake(async function () {
            callCount += 1;
            return callCount === 1
                ? new Response(null, { status: 401 })
                : new Response(new Uint8Array([ 1, 2, 3 ]));
        });
        const registryClient = registryClientFactory({ fetch: fetchImplementation });

        const result = await registryClient.fetchTarball(
            'https://registry.example.test/pkg.tgz',
            emptyTarballIntegrity,
            {
                registryAddress: 'https://registry.example.test/',
                authentication: {
                    publish: { type: 'basic', username: 'reader', password: 'reader-secret' },
                    metadata: 'automatic'
                }
            }
        );

        assert.deepStrictEqual(result, Buffer.from([ 1, 2, 3 ]));
        assertDeepSubset(fetchImplementation, {
            callCount: 2,
            secondCall: {
                arguments: [
                    'https://registry.example.test/pkg.tgz',
                    {
                        headers: {
                            Authorization: `Basic ${Buffer.from('reader:reader-secret').toString('base64')}`
                        },
                        redirect: 'manual'
                    }
                ]
            }
        });
    });
});
