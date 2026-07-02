import assert from 'node:assert';
import fc from 'fast-check';
import { suite, test } from 'mocha';
import type { FileDescription } from './file-description.ts';
import { compareFileDescriptions } from './compare.ts';

const fileDescriptionArbitrary = fc.record<FileDescription>({
    filePath: fc.string(),
    content: fc.string(),
    isExecutable: fc.boolean()
});

function firstFileDescription(fileDescriptions: readonly FileDescription[]): FileDescription {
    const first = fileDescriptions[0];
    if (first === undefined) {
        throw new Error('Expected at least one generated file description');
    }
    return first;
}

suite('compare', function () {
    test('compareFileDescriptions() is order-insensitive for equivalent file sets', function () {
        fc.assert(
            fc.property(
                fc.uniqueArray(fileDescriptionArbitrary, {
                    selector(fileDescription) {
                        return fileDescription.filePath;
                    },
                    maxLength: 20
                }),
                function (fileDescriptions) {
                    const permutation = fileDescriptions.toReversed();

                    assert.deepStrictEqual(compareFileDescriptions(fileDescriptions, permutation), { status: 'equal' });
                }
            )
        );
    });

    test('compareFileDescriptions() reports non-equal when any file content changes', function () {
        fc.assert(
            fc.property(
                fc.array(fileDescriptionArbitrary, { minLength: 1, maxLength: 20 }),
                fc.string(),
                function (fileDescriptions, suffix) {
                    const modified = Array.from(fileDescriptions);
                    const first = firstFileDescription(modified);
                    modified[0] = {
                        ...first,
                        content: `${first.content}${suffix}x`
                    };

                    assert.deepStrictEqual(compareFileDescriptions(fileDescriptions, modified), {
                        status: 'not-equal'
                    });
                }
            )
        );
    });
});
