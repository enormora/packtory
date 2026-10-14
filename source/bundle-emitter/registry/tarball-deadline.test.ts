import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createFakeClock } from '../../test-libraries/fake-clock.ts';
import { fetchPackageTarball } from './package-tarball-fetcher.ts';

const settings = { authentication: { type: 'bearer-token', token: 'tok' } } as const;
const tarballAddress = 'https://registry.npmjs.org/pkg.tgz';
const emptyIntegrity = { integrity: undefined, shasum: undefined } as const;

suite('tarball-deadline', function () {
    test('aborts a pending download at thirty seconds', async function () {
        const clock = createFakeClock();
        const requestSignals: AbortSignal[] = [];
        const download = fetchPackageTarball(
            {
                clock,
                async fetch(_address, options) {
                    const signal = options?.signal;
                    assert.ok(signal instanceof AbortSignal);
                    requestSignals.push(signal);
                    return new Promise<Response>(function (_resolve, reject) {
                        signal.addEventListener('abort', function () {
                            const reason: unknown = signal.reason;
                            assert.ok(reason instanceof Error);
                            reject(reason);
                        });
                    });
                }
            },
            tarballAddress,
            emptyIntegrity,
            settings
        );
        const rejection = assert.rejects(download, /^Error: Registry tarball download exceeded 30000 ms$/u);
        clock.tick(29_999);
        assert.strictEqual(requestSignals[0]?.aborted, false);
        clock.tick(1);
        assert.strictEqual(requestSignals[0].aborted, true);
        await rejection;
    });

    test('clears the deadline after a successful download', async function () {
        const clock = createFakeClock();
        const requestSignals: AbortSignal[] = [];
        const downloaded = await fetchPackageTarball(
            {
                clock,
                async fetch(_address, options) {
                    const signal = options?.signal;
                    assert.ok(signal instanceof AbortSignal);
                    requestSignals.push(signal);
                    return new Response('artifact');
                }
            },
            tarballAddress,
            emptyIntegrity,
            settings
        );
        clock.tick(30_000);
        assert.deepStrictEqual(downloaded, Buffer.from('artifact'));
        assert.strictEqual(requestSignals[0]?.aborted, false);
    });
});
