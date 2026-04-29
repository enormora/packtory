import assert from 'node:assert';
import fc from 'fast-check';
import { test } from 'mocha';
import type { FileDescription } from './file-description.ts';
import { compareFileDescriptions } from './compare.ts';

const fileDescriptionArbitrary = fc.record<FileDescription>({
    filePath: fc.string(),
    content: fc.string(),
    isExecutable: fc.boolean()
});

test('compareFileDescriptions() is order-insensitive for equivalent file sets', () => {
    fc.assert(
        fc.property(
            fc.uniqueArray(fileDescriptionArbitrary, {
                selector: (fileDescription) => {
                    return fileDescription.filePath;
                },
                maxLength: 20
            }),
            (fileDescriptions) => {
                const permutation = Array.from(fileDescriptions).reverse();

                assert.deepStrictEqual(compareFileDescriptions(fileDescriptions, permutation), { status: 'equal' });
            }
        )
    );
});

test('compareFileDescriptions() reports non-equal when any file content changes', () => {
    fc.assert(
        fc.property(
            fc.array(fileDescriptionArbitrary, { minLength: 1, maxLength: 20 }),
            fc.string(),
            (fileDescriptions, suffix) => {
                const modified = Array.from(fileDescriptions);
                const first = modified[0]!;
                modified[0] = {
                    ...first,
                    content: `${first.content}${suffix}x`
                };

                assert.deepStrictEqual(compareFileDescriptions(fileDescriptions, modified), { status: 'not-equal' });
            }
        )
    );
});
