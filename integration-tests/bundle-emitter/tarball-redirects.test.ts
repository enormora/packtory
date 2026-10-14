import assert from 'node:assert';
import * as timers from 'node:timers';
import npmFetch from 'npm-registry-fetch';
import { suite, test } from 'mocha';
import { createRegistryClient, type RegistryClient } from '../../source/bundle-emitter/registry/registry-client.ts';

import { withRegistryServer } from './registry-server-test-support.ts';

const emptyIntegrity = { integrity: undefined, shasum: undefined } as const;

function registryClient(): RegistryClient {
    return createRegistryClient({
        npmFetch: {
            async javaScriptObjectNotation(address, options) {
                return npmFetch.json(address, options);
            }
        },
        fetch,
        async publish() {
            throw new Error('Publishing is outside this test');
        },
        async resolveIdentifierToken() {
            throw new Error('OIDC is outside this test');
        },
        clock: {
            getCurrentTimeInMilliseconds: Date.now,
            setTimeout: timers.setTimeout,
            clearTimeout: timers.clearTimeout
        }
    });
}

suite('registry tarball redirects', function () {
    test('rejects a redirect to another port before making an authenticated request there', async function () {
        const receivedAuthorization: (string | undefined)[] = [];
        await withRegistryServer(function (request, response) {
            receivedAuthorization.push(request.headers.authorization);
            response.end('artifact');
        }, async function (otherRegistry) {
            await withRegistryServer(function (_request, response) {
                response.writeHead(302, { location: `${otherRegistry}artifact` });
                response.end();
            }, async function (registryAddress) {
                await assert.rejects(
                    registryClient().fetchTarball(`${registryAddress}artifact`, emptyIntegrity, {
                        registryAddress,
                        authentication: { type: 'bearer-token', token: 'audit-sentinel' }
                    }),
                    /differs from the configured registry origin/u
                );
            });
        });
        assert.deepStrictEqual(receivedAuthorization, []);
    });

    test('follows a relative redirect within the registry and retains basic authentication', async function () {
        const receivedAuthorization: (string | undefined)[] = [];
        await withRegistryServer(function (request, response) {
            receivedAuthorization.push(request.headers.authorization);
            if (request.url === '/start') {
                response.writeHead(307, { location: '/artifact' });
                response.end();
                return;
            }
            response.end('artifact');
        }, async function (registryAddress) {
            const artifact = await registryClient().fetchTarball(`${registryAddress}start`, emptyIntegrity, {
                registryAddress,
                authentication: { type: 'basic', username: 'reader', password: 'secret' }
            });
            assert.deepStrictEqual(artifact, Buffer.from('artifact'));
        });
        const authorization = `Basic ${Buffer.from('reader:secret').toString('base64')}`;
        assert.deepStrictEqual(receivedAuthorization, [ authorization, authorization ]);
    });
});
