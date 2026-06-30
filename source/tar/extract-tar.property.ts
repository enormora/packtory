import assert from 'node:assert';
import fc from 'fast-check';
import { suite, test } from 'mocha';
import { extractTarEntries } from './extract-tar.ts';

const nonGzipBufferArbitrary = fc.uint8Array({ maxLength: 256 }).filter(function (data) {
    return data.length < 2 || data[0] !== 0x1F || data[1] !== 0x8B;
});

async function expectFailure(action: () => Promise<unknown>): Promise<void> {
    try {
        await action();
        assert.fail('Expected the action to throw an error');
    } catch (error: unknown) {
        assert.ok(error instanceof Error);
    }
}

suite('extract-tar', function () {
    test('extractTarEntries() rejects malformed non-gzip buffers explicitly', async function () {
        await fc.assert(
            fc.asyncProperty(nonGzipBufferArbitrary, async function (data) {
                await expectFailure(async function () {
                    await extractTarEntries(Buffer.from(data));
                });
            }),
            { numRuns: 50 }
        );
    });

    test('extractTarEntries() rejects malformed non-gzip buffers without needing exact error text', async function () {
        await fc.assert(
            fc.asyncProperty(nonGzipBufferArbitrary, async function (data) {
                try {
                    const result = await extractTarEntries(Buffer.from(data));
                    assert.fail(`Expected extractTarEntries() to reject, but it returned ${result.length} entries`);
                } catch (error: unknown) {
                    assert.ok(error instanceof Error);
                }
            }),
            { numRuns: 50 }
        );
    });
});
