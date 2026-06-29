import assert from 'node:assert';
import { suite, test } from 'mocha';
import { collectTimeoutMutants } from './timeout-mutant-collector.ts';

suite('timeout-mutant-collector', function () {
    test('collectTimeoutMutants returns an empty array when the report has no files', function () {
        assert.deepStrictEqual(collectTimeoutMutants({}), []);
    });

    test('collectTimeoutMutants returns an empty array when a file entry is undefined', function () {
        assert.deepStrictEqual(collectTimeoutMutants({ files: { 'source/a.ts': undefined } }), []);
    });

    test('collectTimeoutMutants returns an empty array when a file report has no mutants', function () {
        assert.deepStrictEqual(collectTimeoutMutants({ files: { 'source/a.ts': {} } }), []);
    });

    test('collectTimeoutMutants ignores mutants whose status is not Timeout', function () {
        assert.deepStrictEqual(
            collectTimeoutMutants({
                files: {
                    'source/a.ts': {
                        mutants: [ { status: 'Killed', location: { start: { line: 1, column: 2 } } } ]
                    }
                }
            }),
            []
        );
    });

    test('collectTimeoutMutants ignores static Timeout mutants', function () {
        assert.deepStrictEqual(
            collectTimeoutMutants({
                files: {
                    'source/a.ts': {
                        mutants: [
                            {
                                status: 'Timeout',
                                static: true,
                                location: { start: { line: 3, column: 4 } }
                            }
                        ]
                    }
                }
            }),
            []
        );
    });

    test('collectTimeoutMutants returns the file path with line and column for a Timeout mutant', function () {
        assert.deepStrictEqual(
            collectTimeoutMutants({
                files: {
                    'source/a.ts': {
                        mutants: [ { status: 'Timeout', location: { start: { line: 3, column: 4 } } } ]
                    }
                }
            }),
            [ { filePath: 'source/a.ts', line: 3, column: 4 } ]
        );
    });

    test('collectTimeoutMutants returns every Timeout mutant across multiple files in order', function () {
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
                        mutants: [ { status: 'Timeout', location: { start: { line: 5, column: 6 } } } ]
                    }
                }
            }),
            [
                { filePath: 'source/a.ts', line: 3, column: 4 },
                { filePath: 'source/b.ts', line: 5, column: 6 }
            ]
        );
    });
});
