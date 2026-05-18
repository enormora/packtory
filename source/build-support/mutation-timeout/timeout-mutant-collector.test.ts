import assert from 'node:assert';
import { test } from 'mocha';
import { collectTimeoutMutants } from './timeout-mutant-collector.ts';

test('collectTimeoutMutants returns an empty array when the report has no files', () => {
    assert.deepStrictEqual(collectTimeoutMutants({}), []);
});

test('collectTimeoutMutants returns an empty array when a file entry is undefined', () => {
    assert.deepStrictEqual(collectTimeoutMutants({ files: { 'source/a.ts': undefined } }), []);
});

test('collectTimeoutMutants returns an empty array when a file report has no mutants', () => {
    assert.deepStrictEqual(collectTimeoutMutants({ files: { 'source/a.ts': {} } }), []);
});

test('collectTimeoutMutants ignores mutants whose status is not Timeout', () => {
    assert.deepStrictEqual(
        collectTimeoutMutants({
            files: {
                'source/a.ts': {
                    mutants: [{ status: 'Killed', location: { start: { line: 1, column: 2 } } }]
                }
            }
        }),
        []
    );
});

test('collectTimeoutMutants returns the file path with line and column for a Timeout mutant', () => {
    assert.deepStrictEqual(
        collectTimeoutMutants({
            files: {
                'source/a.ts': {
                    mutants: [{ status: 'Timeout', location: { start: { line: 3, column: 4 } } }]
                }
            }
        }),
        [{ filePath: 'source/a.ts', line: 3, column: 4 }]
    );
});

test('collectTimeoutMutants returns every Timeout mutant across multiple files in order', () => {
    assert.deepStrictEqual(
        collectTimeoutMutants({
            files: {
                'source/a.ts': {
                    mutants: [
                        { status: 'Killed', location: { start: { line: 1, column: 2 } } },
                        { status: 'Timeout', location: { start: { line: 3, column: 4 } } }
                    ]
                },
                'source/b.ts': {
                    mutants: [{ status: 'Timeout', location: { start: { line: 5, column: 6 } } }]
                }
            }
        }),
        [
            { filePath: 'source/a.ts', line: 3, column: 4 },
            { filePath: 'source/b.ts', line: 5, column: 6 }
        ]
    );
});
