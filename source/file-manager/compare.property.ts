import assert from 'node:assert';
import fastCheck from 'fast-check';
import { suite, test } from 'mocha';
import type { FileDescription } from './file-description.ts';
import { compareFileDescriptions } from './compare.ts';

const fileDescriptionArbitrary = fastCheck.record<FileDescription>({
    filePath: fastCheck.string(),
    content: fastCheck.string(),
    isExecutable: fastCheck.boolean()
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
        fastCheck.assert(
            fastCheck.property(
                fastCheck.uniqueArray(fileDescriptionArbitrary, {
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
        fastCheck.assert(
            fastCheck.property(
                fastCheck.array(fileDescriptionArbitrary, { minLength: 1, maxLength: 20 }),
                fastCheck.string(),
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
