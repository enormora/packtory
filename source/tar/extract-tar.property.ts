import assert from 'node:assert';
import fc from 'fast-check';
import { test } from 'mocha';
import { extractTarEntries } from './extract-tar.ts';

const nonGzipBufferArbitrary = fc.uint8Array({ maxLength: 256 }).filter((data) => {
    return data.length < 2 || data[0] !== 0x1f || data[1] !== 0x8b;
});

async function expectFailure(action: () => Promise<unknown>): Promise<void> {
    try {
        await action();
        assert.fail('Expected the action to throw an error');
    } catch (error: unknown) {
        assert.ok(error instanceof Error);
    }
}

test('extractTarEntries() rejects malformed non-gzip buffers explicitly', async () => {
    await fc.assert(
        fc.asyncProperty(nonGzipBufferArbitrary, async (data) => {
            await expectFailure(async () => {
                await extractTarEntries(Buffer.from(data));
            });
        }),
        { numRuns: 50 }
    );
});

test('extractTarEntries() rejects malformed non-gzip buffers without needing exact error text', async () => {
    await fc.assert(
        fc.asyncProperty(nonGzipBufferArbitrary, async (data) => {
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
