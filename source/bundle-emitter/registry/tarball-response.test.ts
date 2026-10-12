import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { readTarballResponse } from './tarball-response.ts';

suite('tarball-response', function () {
    test('returns an empty buffer for a response without a body', async function () {
        assert.deepStrictEqual(await readTarballResponse(new Response(null), 5), Buffer.alloc(0));
    });

    test('accepts streamed bytes exactly at the limit without content-length', async function () {
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(Buffer.from('abc'));
                controller.enqueue(Buffer.from('de'));
                controller.close();
            }
        });
        assert.deepStrictEqual(await readTarballResponse(new Response(body), 5), Buffer.from('abcde'));
    });

    for (const contentLength of [ undefined, '1' ]) {
        test(`cancels an oversized stream with content-length ${String(contentLength)}`, async function () {
            let pulled = 0;
            const cancel = fake();
            const body = new ReadableStream<Uint8Array>({
                pull(controller) {
                    pulled += 1;
                    controller.enqueue(Buffer.from('abc'));
                },
                cancel
            }, { highWaterMark: 0 });
            const response = new Response(body, {
                headers: contentLength === undefined ? {} : { 'content-length': contentLength }
            });
            await assert.rejects(
                readTarballResponse(response, 5),
                /^Error: Refusing to download tarball larger than 5 bytes$/u
            );
            assert.strictEqual(pulled, 2);
            assert.strictEqual(cancel.callCount, 1);
        });
    }

    test('cancels oversized content-length before pulling any bytes', async function () {
        const pull = fake();
        const cancel = fake();
        const body = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 });
        await assert.rejects(
            readTarballResponse(
                new Response(body, {
                    headers: { 'content-length': '6' }
                }),
                5
            ),
            /^Error: Refusing to download tarball larger than 5 bytes$/u
        );
        assert.strictEqual(pull.callCount, 0);
        assert.strictEqual(cancel.callCount, 1);
    });

    test('rejects oversized content-length even when the body is absent', async function () {
        await assert.rejects(
            readTarballResponse(new Response(null, { headers: { 'content-length': '6' } }), 5),
            /^Error: Refusing to download tarball larger than 5 bytes$/u
        );
    });

    test('propagates stream failures', async function () {
        const error = new Error('Connection interrupted');
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.error(error);
            }
        });
        await assert.rejects(readTarballResponse(new Response(body), 5), function (received) {
            return received === error;
        });
    });
});
