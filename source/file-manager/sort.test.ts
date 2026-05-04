import assert from 'node:assert';
import { test } from 'mocha';
import { sortByFilePath } from './sort.ts';

test('sortByFilePath() sorts file descriptions in ascending path order', () => {
    const result = sortByFilePath([
        { filePath: 'c.txt', content: '', isExecutable: false },
        { filePath: 'a.txt', content: '', isExecutable: false },
        { filePath: 'b.txt', content: '', isExecutable: false }
    ]);

    assert.deepStrictEqual(
        result.map((file) => {
            return file.filePath;
        }),
        ['a.txt', 'b.txt', 'c.txt']
    );
});

test('sortByFilePath() sorts two entries when the first path is greater than the second', () => {
    const result = sortByFilePath([
        { filePath: 'b.txt', content: 'second', isExecutable: false },
        { filePath: 'a.txt', content: 'first', isExecutable: false }
    ]);

    assert.deepStrictEqual(result, [
        { filePath: 'a.txt', content: 'first', isExecutable: false },
        { filePath: 'b.txt', content: 'second', isExecutable: false }
    ]);
});

test('sortByFilePath() uses plain string ordering for punctuation-heavy paths', () => {
    const result = sortByFilePath([
        { filePath: '[', content: 'open-bracket', isExecutable: false },
        { filePath: '<', content: 'less-than', isExecutable: false }
    ]);

    assert.deepStrictEqual(result, [
        { filePath: '<', content: 'less-than', isExecutable: false },
        { filePath: '[', content: 'open-bracket', isExecutable: false }
    ]);
});

test('sortByFilePath() keeps equal paths grouped without throwing', () => {
    const result = sortByFilePath([
        { filePath: 'a.txt', content: 'first', isExecutable: false },
        { filePath: 'a.txt', content: 'second', isExecutable: false }
    ]);

    assert.deepStrictEqual(
        result.map((file) => {
            return file.filePath;
        }),
        ['a.txt', 'a.txt']
    );
});

test('sortByFilePath() keeps equal paths in their original order', () => {
    const result = sortByFilePath([
        { filePath: 'a.txt', content: 'first', isExecutable: false },
        { filePath: 'a.txt', content: 'second', isExecutable: false },
        { filePath: 'b.txt', content: 'third', isExecutable: false }
    ]);

    assert.deepStrictEqual(
        result.map((file) => {
            return file.content;
        }),
        ['first', 'second', 'third']
    );
});
