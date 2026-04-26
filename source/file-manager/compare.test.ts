import assert from 'node:assert';
import { test } from 'mocha';
import { compareFileDescriptions } from './compare.ts';

test('returns equal when both file lists are empty', () => {
    const result = compareFileDescriptions([], []);
    assert.deepStrictEqual(result, { status: 'equal' });
});

test('returns equal when both file lists have single element which is the same', () => {
    const result = compareFileDescriptions(
        [{ filePath: 'a', content: 'a', isExecutable: false }],
        [{ filePath: 'a', content: 'a', isExecutable: false }]
    );
    assert.deepStrictEqual(result, { status: 'equal' });
});

test('returns equal when both file lists have multiple elements which are the same and are in the same order', () => {
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

test('returns equal when both file lists have multiple elements which are the same and are in different order', () => {
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

test('returns not-equal when one list is empty but the other not', () => {
    const result = compareFileDescriptions([], [{ filePath: 'a', content: 'a', isExecutable: false }]);
    assert.deepStrictEqual(result, { status: 'not-equal' });
});

test('returns not-equal when one list is not empty but the other is', () => {
    const result = compareFileDescriptions([{ filePath: 'a', content: 'a', isExecutable: true }], []);
    assert.deepStrictEqual(result, { status: 'not-equal' });
});

test('returns not-equal when both file lists have single element which is not the same', () => {
    const result = compareFileDescriptions(
        [{ filePath: 'a', content: 'a', isExecutable: true }],
        [{ filePath: 'b', content: 'b', isExecutable: false }]
    );
    assert.deepStrictEqual(result, { status: 'not-equal' });
});

test('returns not-equal when both file lists have single element where only the filePath is different', () => {
    const result = compareFileDescriptions(
        [{ filePath: 'a', content: 'a', isExecutable: true }],
        [{ filePath: 'b', content: 'a', isExecutable: true }]
    );
    assert.deepStrictEqual(result, { status: 'not-equal' });
});

test('returns not-equal when both file lists have single element where only the content is different', () => {
    const result = compareFileDescriptions(
        [{ filePath: 'a', content: 'a', isExecutable: false }],
        [{ filePath: 'a', content: 'b', isExecutable: false }]
    );
    assert.deepStrictEqual(result, { status: 'not-equal' });
});

test('returns not-equal when both file lists have single element where only the isExecutable flag is different', () => {
    const result = compareFileDescriptions(
        [{ filePath: 'a', content: 'a', isExecutable: false }],
        [{ filePath: 'a', content: 'a', isExecutable: true }]
    );
    assert.deepStrictEqual(result, { status: 'not-equal' });
});

test('returns not-equal when both file lists have multiple elements where some are not the same', () => {
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
