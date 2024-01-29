import test from 'ava';
import { compareFileDescriptions } from './compare.js';

test('returns equal when both file lists are empty', (t) => {
    const result = compareFileDescriptions([], []);
    t.deepEqual(result, { status: 'equal' });
});

test('returns equal when both file lists have single element which is the same', (t) => {
    const result = compareFileDescriptions([{ filePath: 'a', content: 'a' }], [{ filePath: 'a', content: 'a' }]);
    t.deepEqual(result, { status: 'equal' });
});

test('returns equal when both file lists have multiple elements which are the same and are in the same order', (t) => {
    const result = compareFileDescriptions(
        [
            { filePath: 'a', content: 'a' },
            { filePath: 'b', content: 'b' }
        ],
        [
            { filePath: 'a', content: 'a' },
            { filePath: 'b', content: 'b' }
        ]
    );
    t.deepEqual(result, { status: 'equal' });
});

test('returns equal when both file lists have multiple elements which are the same and are in different order', (t) => {
    const result = compareFileDescriptions(
        [
            { filePath: 'a', content: 'a' },
            { filePath: 'b', content: 'b' }
        ],
        [
            { filePath: 'b', content: 'b' },
            { filePath: 'a', content: 'a' }
        ]
    );
    t.deepEqual(result, { status: 'equal' });
});

test('returns not-equal when one list is empty but the other not', (t) => {
    const result = compareFileDescriptions([], [{ filePath: 'a', content: 'a' }]);
    t.deepEqual(result, { status: 'not-equal' });
});

test('returns not-equal when one list is not empty but the other is', (t) => {
    const result = compareFileDescriptions([{ filePath: 'a', content: 'a' }], []);
    t.deepEqual(result, { status: 'not-equal' });
});

test('returns not-equal when both file lists have single element which is not the same', (t) => {
    const result = compareFileDescriptions([{ filePath: 'a', content: 'a' }], [{ filePath: 'b', content: 'b' }]);
    t.deepEqual(result, { status: 'not-equal' });
});

test('returns not-equal when both file lists have single element where only the filePath is different', (t) => {
    const result = compareFileDescriptions([{ filePath: 'a', content: 'a' }], [{ filePath: 'b', content: 'a' }]);
    t.deepEqual(result, { status: 'not-equal' });
});

test('returns not-equal when both file lists have single element where only the content is different', (t) => {
    const result = compareFileDescriptions([{ filePath: 'a', content: 'a' }], [{ filePath: 'a', content: 'b' }]);
    t.deepEqual(result, { status: 'not-equal' });
});

test('returns not-equal when both file lists have multiple elements where some are not the same', (t) => {
    const result = compareFileDescriptions(
        [
            { filePath: 'a', content: 'a' },
            { filePath: 'b', content: 'b' }
        ],
        [
            { filePath: 'a', content: 'a' },
            { filePath: 'b', content: 'a' }
        ]
    );
    t.deepEqual(result, { status: 'not-equal' });
});
