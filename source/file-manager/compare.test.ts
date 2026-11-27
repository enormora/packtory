import assert from 'node:assert';
import { suite, test } from 'mocha';
import { compareFileDescriptions } from './compare.ts';
import type { FileDescription } from './file-description.ts';

suite('compare', function () {
    suite('equal results', function () {
        test('returns equal when both file lists are empty', function () {
            const result = compareFileDescriptions([], []);
            assert.deepStrictEqual(result, { status: 'equal' });
        });

        test('returns equal when both file lists have single element which is the same', function () {
            const result = compareFileDescriptions(
                [ { filePath: 'a', content: 'a', isExecutable: false } ],
                [ { filePath: 'a', content: 'a', isExecutable: false } ]
            );
            assert.deepStrictEqual(result, { status: 'equal' });
        });

        test('returns equal when both file lists have multiple elements which are the same and are in the same order', function () {
            const result = compareFileDescriptions(
                [
                    { filePath: 'a', content: 'a', isExecutable: true },
                    { filePath: 'b', content: 'b', isExecutable: false }
                ],
                [
                    { filePath: 'a', content: 'a', isExecutable: true },
                    { filePath: 'b', content: 'b', isExecutable: false }
                ]
            );
            assert.deepStrictEqual(result, { status: 'equal' });
        });

        test('returns equal when both file lists have multiple elements which are the same and are in different order', function () {
            const result = compareFileDescriptions(
                [
                    { filePath: 'a', content: 'a', isExecutable: true },
                    { filePath: 'b', content: 'b', isExecutable: false }
                ],
                [
                    { filePath: 'b', content: 'b', isExecutable: false },
                    { filePath: 'a', content: 'a', isExecutable: true }
                ]
            );
            assert.deepStrictEqual(result, { status: 'equal' });
        });
    });

    suite('not-equal results', function () {
        test('returns not-equal when one list is empty but the other not', function () {
            const result = compareFileDescriptions([], [ { filePath: 'a', content: 'a', isExecutable: false } ]);
            assert.deepStrictEqual(result, { status: 'not-equal' });
        });

        test('returns not-equal when one list is not empty but the other is', function () {
            const result = compareFileDescriptions([ { filePath: 'a', content: 'a', isExecutable: true } ], []);
            assert.deepStrictEqual(result, { status: 'not-equal' });
        });

        test('returns not-equal when both file lists have single element which is not the same', function () {
            const result = compareFileDescriptions(
                [ { filePath: 'a', content: 'a', isExecutable: true } ],
                [ { filePath: 'b', content: 'b', isExecutable: false } ]
            );
            assert.deepStrictEqual(result, { status: 'not-equal' });
        });

        test('returns not-equal when both file lists have single element where only the filePath is different', function () {
            const result = compareFileDescriptions(
                [ { filePath: 'a', content: 'a', isExecutable: true } ],
                [ { filePath: 'b', content: 'a', isExecutable: true } ]
            );
            assert.deepStrictEqual(result, { status: 'not-equal' });
        });

        test('returns not-equal when both file lists have single element where only the content is different', function () {
            const result = compareFileDescriptions(
                [ { filePath: 'a', content: 'a', isExecutable: false } ],
                [ { filePath: 'a', content: 'b', isExecutable: false } ]
            );
            assert.deepStrictEqual(result, { status: 'not-equal' });
        });

        test('returns not-equal when both file lists have single element where only the isExecutable flag is different', function () {
            const result = compareFileDescriptions(
                [ { filePath: 'a', content: 'a', isExecutable: false } ],
                [ { filePath: 'a', content: 'a', isExecutable: true } ]
            );
            assert.deepStrictEqual(result, { status: 'not-equal' });
        });

        test('returns not-equal when both file lists have multiple elements where some are not the same', function () {
            const result = compareFileDescriptions(
                [
                    { filePath: 'a', content: 'a', isExecutable: true },
                    { filePath: 'b', content: 'b', isExecutable: true }
                ],
                [
                    { filePath: 'a', content: 'a', isExecutable: true },
                    { filePath: 'b', content: 'a', isExecutable: true }
                ]
            );
            assert.deepStrictEqual(result, { status: 'not-equal' });
        });
    });

    test('returns not-equal when a file list contains a missing entry', function () {
        const fileDescriptionsA = [ { filePath: 'a', content: 'a', isExecutable: false } ];
        const fileDescriptionsB = Array.from<FileDescription>({ length: 1 });

        const result = compareFileDescriptions(fileDescriptionsA, fileDescriptionsB);
        assert.deepStrictEqual(result, { status: 'not-equal' });
    });
});
