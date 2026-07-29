import assert from 'node:assert';
import { createGzip } from 'node:zlib';
import { suite, test } from 'mocha';
import tar from 'tar-stream';
import { collectPlaceholderGzipPack } from './placeholder-gzip.ts';

async function collectChunks(chunks: AsyncIterable<unknown>): Promise<Buffer> {
    const pack = Object.assign(tar.pack(), {
        pipe() {
            return chunks;
        }
    });
    return collectPlaceholderGzipPack(pack, createGzip());
}

async function* chunkStream(...chunks: readonly unknown[]): AsyncIterable<unknown> {
    yield* chunks;
}

suite('placeholder-gzip', function () {
    test('collectPlaceholderGzipPack collects Buffer chunks', async function () {
        const result = await collectChunks(chunkStream(Buffer.from('buf')));

        assert.strictEqual(result.toString(), 'buf');
    });

    test('collectPlaceholderGzipPack collects string chunks', async function () {
        const result = await collectChunks(chunkStream('str'));

        assert.strictEqual(result.toString(), 'str');
    });

    test('collectPlaceholderGzipPack collects Uint8Array chunks', async function () {
        const result = await collectChunks(chunkStream(new Uint8Array([ 1, 2, 3 ])));

        assert.deepStrictEqual(Array.from(result), [ 1, 2, 3 ]);
    });

    test('collectPlaceholderGzipPack rejects unsupported chunks', async function () {
        await assert.rejects(async function () {
            await collectChunks(chunkStream(123));
        }, /Expected placeholder gzip stream to yield Buffer, Uint8Array, or string chunks/u);
    });
});
