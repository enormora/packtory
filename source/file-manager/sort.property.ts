import assert from 'node:assert';
import fc from 'fast-check';
import { test } from 'mocha';
import { sortByFilePath } from './sort.ts';
import type { FileDescription } from './file-description.ts';

const fileDescriptionArbitrary = fc.record<FileDescription>({
    filePath: fc.string(),
    content: fc.string(),
    isExecutable: fc.boolean()
});

test('sortByFilePath() returns a sorted copy without losing or mutating entries', () => {
    fc.assert(
        fc.property(fc.array(fileDescriptionArbitrary, { maxLength: 30 }), (fileDescriptions) => {
            const original = Array.from(fileDescriptions);
            const result = sortByFilePath(fileDescriptions);

            assert.deepStrictEqual(fileDescriptions, original);

            for (let index = 1; index < result.length; index += 1) {
                assert.ok(result[index - 1]!.filePath <= result[index]!.filePath);
            }

            const expected = Array.from(fileDescriptions).sort((left, right) => {
                if (left.filePath < right.filePath) {
                    return -1;
                }
                if (left.filePath > right.filePath) {
                    return 1;
                }
                return 0;
            });
            assert.deepStrictEqual(result, expected);
        })
    );
});

test('sortByFilePath() is idempotent', () => {
    fc.assert(
        fc.property(fc.array(fileDescriptionArbitrary, { maxLength: 30 }), (fileDescriptions) => {
            const sortedOnce = sortByFilePath(fileDescriptions);
            const sortedTwice = sortByFilePath(sortedOnce);

            assert.deepStrictEqual(sortedTwice, sortedOnce);
        })
    );
});
