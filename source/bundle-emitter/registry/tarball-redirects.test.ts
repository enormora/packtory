import assert from 'node:assert';
import { createHash } from 'node:crypto';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { fetchTarballForTest } from '../../test-libraries/registry-fetch-fixtures.ts';
import { assertDeepSubset } from '../../test-libraries/deep-subset-assertion.ts';

const settings = { authentication: { type: 'bearer-token', token: 'tok' } } as const;
const tarballAddress = 'https://registry.npmjs.org/pkg.tgz';
const emptyIntegrity = { integrity: undefined, shasum: undefined } as const;
const tarballBytes = Buffer.from('tarball-bytes');
const downgradedTarballAddress = new URL(tarballAddress);
downgradedTarballAddress.protocol = 'http:';

suite('tarball-redirects', function () {
    suite('response policy', function () {
        test('verifies digest metadata and sends explicit redirect and timeout controls', async function () {
            const fetchImplementation = fake.resolves(new Response(tarballBytes));
            const integrity = `sha512-${createHash('sha512').update(tarballBytes).digest('base64')}`;
            assert.deepStrictEqual(
                await fetchTarballForTest(
                    fetchImplementation,
                    tarballAddress,
                    { integrity, shasum: undefined },
                    settings
                ),
                tarballBytes
            );
            assert.partialDeepStrictEqual(fetchImplementation.firstCall.lastArg, {
                headers: { Authorization: 'Bearer tok' },
                redirect: 'manual'
            });
        });

        test('rejects bytes that differ from the registry digest', async function () {
            const integrity = `sha512-${createHash('sha512').update('different').digest('base64')}`;
            await assert.rejects(
                fetchTarballForTest(
                    fake.resolves(new Response(tarballBytes)),
                    tarballAddress,
                    { integrity, shasum: undefined },
                    settings
                ),
                /Downloaded tarball failed dist.integrity verification/u
            );
        });

        test('supports custom registries with anonymous metadata access', async function () {
            const receivedHeaders: Headers[] = [];
            const fetchImplementation = fake(
                async function (_address: unknown, options: Readonly<RequestInit> | undefined) {
                    receivedHeaders.push(new Headers(options?.headers));
                    return new Response(tarballBytes);
                }
            );
            assert.deepStrictEqual(
                await fetchTarballForTest(
                    fetchImplementation,
                    'https://registry.example.test/pkg.tgz',
                    emptyIntegrity,
                    {
                        registryAddress: 'https://registry.example.test/',
                        authentication: { publish: { type: 'npm-open-identity-connect' }, metadata: 'anonymous' }
                    }
                ),
                tarballBytes
            );
            assert.strictEqual(receivedHeaders[0]?.has('authorization'), false);
        });

        test('rejects unsuccessful HTTP responses with their status code', async function () {
            await assert.rejects(
                fetchTarballForTest(
                    fake.resolves(new Response('error', { status: 500 })),
                    tarballAddress,
                    emptyIntegrity,
                    settings
                ),
                { message: 'Tarball download failed with status 500', statusCode: 500 }
            );
        });
    });

    suite('redirect policy', function () {
        for (const status of [ 301, 302, 303, 307, 308 ]) {
            test(`follows a same-origin relative redirect with status ${status}`, async function () {
                let calls = 0;
                const fetchImplementation = fake(async function () {
                    calls += 1;
                    return calls === 1
                        ? new Response(null, { status, headers: { location: '/redirected' } })
                        : new Response(tarballBytes);
                });
                assert.deepStrictEqual(
                    await fetchTarballForTest(fetchImplementation, tarballAddress, emptyIntegrity, settings),
                    tarballBytes
                );
                assertDeepSubset(fetchImplementation, {
                    secondCall: {
                        arguments: [
                            'https://registry.npmjs.org/redirected',
                            { headers: { Authorization: 'Bearer tok' } }
                        ]
                    }
                });
            });
        }

        for (
            const location of [
                'https://attacker.example/pkg.tgz',
                downgradedTarballAddress.href,
                'https://registry.npmjs.org:8443/pkg.tgz'
            ]
        ) {
            test(`rejects redirects outside the configured origin: ${location}`, async function () {
                const fetchImplementation = fake.resolves(new Response(null, { status: 302, headers: { location } }));
                await assert.rejects(
                    fetchTarballForTest(fetchImplementation, tarballAddress, emptyIntegrity, settings),
                    /differs from the configured registry origin/u
                );
                assert.strictEqual(fetchImplementation.callCount, 1);
            });
        }

        test('rejects redirects without a Location header', async function () {
            await assert.rejects(
                fetchTarballForTest(
                    fake.resolves(new Response(null, { status: 302 })),
                    tarballAddress,
                    emptyIntegrity,
                    settings
                ),
                /^Error: Registry tarball redirect is missing a Location header$/u
            );
        });

        test('rejects a redirect loop after twenty redirects', async function () {
            let requests = 0;
            const fetchImplementation = fake(async function () {
                requests += 1;
                assert.ok(requests <= 21, 'The redirect budget must prevent another network request');
                return new Response(null, { status: 302, headers: { location: '/loop' } });
            });
            await assert.rejects(
                fetchTarballForTest(fetchImplementation, tarballAddress, emptyIntegrity, settings),
                /^Error: Registry tarball download exceeded 20 redirects$/u
            );
            assert.strictEqual(fetchImplementation.callCount, 21);
        });

        test('accepts a tarball after exactly twenty redirects', async function () {
            let calls = 0;
            const fetchImplementation = fake(async function () {
                calls += 1;
                return calls <= 20
                    ? new Response(null, { status: 302, headers: { location: '/loop' } })
                    : new Response(tarballBytes);
            });
            assert.deepStrictEqual(
                await fetchTarballForTest(fetchImplementation, tarballAddress, emptyIntegrity, settings),
                tarballBytes
            );
            assert.strictEqual(fetchImplementation.callCount, 21);
        });
    });
});
