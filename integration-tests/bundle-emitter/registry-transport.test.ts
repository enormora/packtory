import assert from 'node:assert';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { publish } from 'libnpmpublish';
import npmFetch from 'npm-registry-fetch';
import { suite, test } from 'mocha';
import { createClock } from '../../source/common/clock.ts';
import {
    createRegistryJavaScriptObjectNotationFetch,
    withRegistryTransport
} from '../../source/bundle-emitter/registry/registry-transport.ts';
import { withRegistryServer } from './registry-server-test-support.ts';

const maximumMetadataBytes = 33_554_432;

const dependencies = {
    clock: createClock(),
    resolveProxy() {
        return '';
    }
};

async function publishTestPackage(options: Readonly<Record<string, unknown>>): Promise<unknown> {
    return publish({ name: 'test-package', version: '1.0.0' }, Buffer.from('tarball'), options);
}

suite('registry transport', function () {
    for (const stage of [ false, true ]) {
        test(`rejects cross-origin redirects when publishing with stage=${stage}`, async function () {
            const forwardedRequests: string[] = [];
            await withRegistryServer(function (request, response) {
                forwardedRequests.push(request.url ?? '');
                response.end('{}');
            }, async function (destination) {
                await withRegistryServer(function (_request, response) {
                    response.writeHead(307, { location: destination });
                    response.end();
                }, async function (registry) {
                    await assert.rejects(
                        withRegistryTransport(dependencies, {
                            registry,
                            stage,
                            forceAuth: { token: 'audit-sentinel' }
                        }, publishTestPackage),
                        /differs from the configured registry origin/u
                    );
                });
            });
            assert.deepStrictEqual(forwardedRequests, []);
        });
    }

    test('rejects a metadata redirect to another port before forwarding credentials', async function () {
        const forwardedRequests: string[] = [];
        await withRegistryServer(function (request, response) {
            forwardedRequests.push(request.url ?? '');
            response.end('{}');
        }, async function (destination) {
            await withRegistryServer(function (_request, response) {
                response.writeHead(302, { location: destination });
                response.end();
            }, async function (registry) {
                const transport = createRegistryJavaScriptObjectNotationFetch({ ...dependencies, npmFetch });
                await assert.rejects(
                    transport.javaScriptObjectNotation('/package', {
                        registry,
                        forceAuth: { token: 'audit-sentinel' }
                    }),
                    /differs from the configured registry origin/u
                );
            });
        });
        assert.deepStrictEqual(forwardedRequests, []);
    });

    test('follows same-origin metadata redirects and preserves credentials', async function () {
        const receivedCredentials: (string | undefined)[] = [];
        await withRegistryServer(function (request, response) {
            receivedCredentials.push(request.headers.authorization);
            if (request.url === '/package') {
                response.writeHead(302, { location: '/metadata' });
                response.end();
                return;
            }
            response.end('{"name":"test-package"}');
        }, async function (registry) {
            const transport = createRegistryJavaScriptObjectNotationFetch({ ...dependencies, npmFetch });
            assert.deepStrictEqual(
                await transport.javaScriptObjectNotation('/package', {
                    registry,
                    forceAuth: { token: 'audit-sentinel' }
                }),
                { name: 'test-package' }
            );
        });
        assert.deepStrictEqual(receivedCredentials, [ 'Bearer audit-sentinel', 'Bearer audit-sentinel' ]);
    });

    test('bounds decompressed metadata even when the compressed transfer is small', async function () {
        const body = await promisify(gzip)(Buffer.alloc(maximumMetadataBytes + 1, ' '));
        await withRegistryServer(function (_request, response) {
            response.writeHead(200, { 'content-encoding': 'gzip' });
            response.end(body);
        }, async function (registry) {
            const transport = createRegistryJavaScriptObjectNotationFetch({ ...dependencies, npmFetch });
            await assert.rejects(
                transport.javaScriptObjectNotation('/package', { registry }),
                /Registry metadata exceeds/u
            );
        });
    });
});
