import assert from 'node:assert';
import { ClientRequest } from 'node:http';
import { Readable } from 'node:stream';
import { suite, test } from 'mocha';
import { ProxyAgent } from 'proxy-agent';
import { createStubInstance } from 'sinon';
import { createFakeClock } from '../../test-libraries/fake-clock.ts';
import { createRegistryJsonFetch, withRegistryTransport } from './registry-transport.ts';

const maximumMetadataBytes = 33_554_432;

function resolveProxy(): string {
    return '';
}

suite('registry transport', function () {
    test('preserves the configured registry and credentials when opening a request', async function () {
        const proxyRequests: string[] = [];
        const credentials = { token: 'private-registry-token' };
        const request = createStubInstance(ClientRequest);
        await withRegistryTransport(
            {
                clock: createFakeClock(),
                resolveProxy(url) {
                    proxyRequests.push(url);
                    return '';
                }
            },
            { registry: 'https://private-registry.test/', forceAuth: credentials },
            async function (options) {
                assert.deepStrictEqual(options.forceAuth, credentials);
                assert.ok(options.agent instanceof ProxyAgent);
                await options.agent.getProxyForUrl('https://private-registry.test/package', request);
            }
        );
        assert.deepStrictEqual(proxyRequests, [ 'https://private-registry.test/package' ]);
    });

    test('aborts an outstanding request at the total deadline', async function () {
        const clock = createFakeClock();
        const signals: AbortSignal[] = [];
        const pending = withRegistryTransport({ clock, resolveProxy }, {}, async function (options) {
            assert.ok(options.signal instanceof AbortSignal);
            signals.push(options.signal);
            options.signal.throwIfAborted();
            return new Promise(function (_resolve, reject) {
                signals[0]?.addEventListener('abort', function () {
                    const reason: unknown = signals[0]?.reason;
                    assert.ok(reason instanceof Error);
                    reject(reason);
                });
            });
        });
        clock.tick(299_999);
        assert.strictEqual(signals[0]?.aborted, false);
        clock.tick(1);
        assert.strictEqual(signals[0].aborted, true);
        await assert.rejects(pending, /Registry request exceeded 300000 ms/u);
    });

    test('clears the deadline after completing a request', async function () {
        const clock = createFakeClock();
        const signals: AbortSignal[] = [];
        const result = await withRegistryTransport({ clock, resolveProxy }, {}, async function (options) {
            assert.ok(options.signal instanceof AbortSignal);
            signals.push(options.signal);
            return 'completed';
        });
        clock.tick(300_000);
        assert.strictEqual(result, 'completed');
        assert.strictEqual(signals[0]?.aborted, false);
    });

    test('aborts the transport when reading metadata fails', async function () {
        const signals: AbortSignal[] = [];
        const transport = createRegistryJsonFetch({
            clock: createFakeClock(),
            resolveProxy,
            async npmFetch(_url, options) {
                assert.ok(options.signal instanceof AbortSignal);
                signals.push(options.signal);
                return { body: Readable.from([ 'invalid chunk' ]) };
            }
        });
        await assert.rejects(transport.json('/package', {}), /invalid body chunk/u);
        assert.strictEqual(signals[0]?.aborted, true);
    });

    for (
        const { description, body } of [
            { description: 'null', body: null },
            { description: 'missing', body: undefined },
            { description: 'plain object', body: {} },
            { description: 'string', body: '{}' }
        ]
    ) {
        test(`rejects an unreadable response body: ${description}`, async function () {
            const transport = createRegistryJsonFetch({
                clock: createFakeClock(),
                resolveProxy,
                async npmFetch() {
                    return { body };
                }
            });
            await assert.rejects(transport.json('/package', {}), /missing a readable body/u);
        });
    }

    test('accepts metadata at the byte limit and rejects the next byte', async function () {
        const bytes = Buffer.alloc(maximumMetadataBytes, ' ');
        bytes.write('{}');
        const transport = createRegistryJsonFetch({
            clock: createFakeClock(),
            resolveProxy,
            async npmFetch(url) {
                return { body: Readable.from(url === '/at-limit' ? [ bytes ] : [ bytes, Buffer.from(' ') ]) };
            }
        });
        assert.deepStrictEqual(await transport.json('/at-limit', {}), {});
        await assert.rejects(transport.json('/over-limit', {}), /Registry metadata exceeds/u);
    });
});
