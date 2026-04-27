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
