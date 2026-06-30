import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import {
    errorWithStatus,
    expectFailure,
    type FakeNpmFetch,
    registryClientFactory
} from '../../test-libraries/registry-client-test-support.ts';

suite('registry-client metadata no retry', function () {
    test('metadata using inherited publish auth does not retry on a 401 challenge', async function () {
        const error = errorWithStatus('auth required', 401);
        const npmFetchJson = fake.rejects(error);
        const registryClient = registryClientFactory({ npmFetchJson });

        await expectFailure(async function () {
            await registryClient.fetchLatestVersion('the-name', {
                auth: { type: 'bearer-token', token: 'writer-token' }
            });
        }, /^Error: auth required$/u);

        assert.strictEqual(npmFetchJson.callCount, 1);
    });

    test('anonymous metadata access does not retry on a 401 challenge', async function () {
        const error = errorWithStatus('auth required', 401);
        const npmFetchJson = fake.rejects(error);
        const registryClient = registryClientFactory({ npmFetchJson });

        await expectFailure(async function () {
            await registryClient.fetchLatestVersion('the-name', {
                auth: {
                    publish: { type: 'bearer-token', token: 'writer-token' },
                    metadata: 'anonymous'
                }
            });
        }, /^Error: auth required$/u);

        assert.strictEqual(npmFetchJson.callCount, 1);
    });

    test('basic metadata auth does not retry on a 401 challenge', async function () {
        const error = errorWithStatus('auth required', 401);
        const npmFetchJson = fake.rejects(error);
        const registryClient = registryClientFactory({ npmFetchJson });

        await expectFailure(async function () {
            await registryClient.fetchLatestVersion('the-name', {
                auth: {
                    publish: { type: 'bearer-token', token: 'writer-token' },
                    metadata: { type: 'basic', username: 'reader', password: 'reader-secret' }
                }
            });
        }, /^Error: auth required$/u);

        assert.strictEqual(npmFetchJson.callCount, 1);
    });

    test('fetchTarball() also retries metadata auto with publish auth on a 401 challenge', async function () {
        const error = errorWithStatus('auth required', 401);
        let callCount = 0;
        const npmFetch = Object.assign(
            fake(async function () {
                callCount += 1;
                if (callCount === 1) {
                    throw error;
                }

                return {
                    buffer: fake.resolves(Buffer.from([ 1, 2, 3 ]))
                };
            }),
            {
                json: Object.assign(fake(), { stream: fake() }),
                pickRegistry: fake()
            }
        ) as unknown as FakeNpmFetch;
        const registryClient = registryClientFactory({ npmFetch });

        const result = await registryClient.fetchTarball('https://registry.example.test/pkg.tgz', {
            registryUrl: 'https://registry.example.test/',
            auth: {
                publish: { type: 'basic', username: 'reader', password: 'reader-secret' },
                metadata: 'auto'
            }
        });

        assert.deepStrictEqual(result, Buffer.from([ 1, 2, 3 ]));
        assert.strictEqual(npmFetch.callCount, 2);
        assert.deepStrictEqual(npmFetch.secondCall.args, [
            'https://registry.example.test/pkg.tgz',
            {
                alwaysAuth: true,
                registry: 'https://registry.example.test/',
                forceAuth: {
                    _auth: Buffer.from('reader:reader-secret', 'utf8').toString('base64')
                }
            }
        ]);
    });
});
