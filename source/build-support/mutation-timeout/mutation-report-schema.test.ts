import assert from 'node:assert';
import { suite, test } from 'mocha';
import { parseMutationReport } from './mutation-report-schema.ts';

suite('mutation-report-schema', function () {
    test('parseMutationReport returns an empty report for a non-object input', function () {
        assert.deepStrictEqual(parseMutationReport(null), {});
    });

    test('parseMutationReport returns an empty report when files is missing', function () {
        assert.deepStrictEqual(parseMutationReport({}), {});
    });

    test('parseMutationReport returns an empty report when files is not an object', function () {
        assert.deepStrictEqual(parseMutationReport({ files: 'invalid' }), {});
    });

    test('parseMutationReport replaces a non-object file report with undefined', function () {
        assert.deepStrictEqual(parseMutationReport({ files: { 'source/a.ts': null } }), {
            files: { 'source/a.ts': undefined }
        });
    });

    test('parseMutationReport returns an empty file entry when mutants is not an array', function () {
        assert.deepStrictEqual(parseMutationReport({ files: { 'source/a.ts': { mutants: 'invalid' } } }), {
            files: { 'source/a.ts': {} }
        });
    });

    test('parseMutationReport skips non-object mutants', function () {
        assert.deepStrictEqual(parseMutationReport({ files: { 'source/a.ts': { mutants: [null, 'string'] } } }), {
            files: { 'source/a.ts': { mutants: [] } }
        });
    });

    test('parseMutationReport skips mutants whose location is not an object', function () {
        assert.deepStrictEqual(
            parseMutationReport({
                files: { 'source/a.ts': { mutants: [{ status: 'Timeout', location: null }] } }
            }),
            { files: { 'source/a.ts': { mutants: [] } } }
        );
    });

    test('parseMutationReport skips mutants whose location.start.line is not a number', function () {
        assert.deepStrictEqual(
            parseMutationReport({
                files: {
                    'source/a.ts': {
                        mutants: [{ status: 'Timeout', location: { start: { line: '3', column: 4 } } }]
                    }
                }
            }),
            { files: { 'source/a.ts': { mutants: [] } } }
        );
    });

    test('parseMutationReport skips mutants whose location.start.column is not a number', function () {
        assert.deepStrictEqual(
            parseMutationReport({
                files: {
                    'source/a.ts': {
                        mutants: [{ status: 'Timeout', location: { start: { line: 3, column: '4' } } }]
                    }
                }
            }),
            { files: { 'source/a.ts': { mutants: [] } } }
        );
    });

    test('parseMutationReport throws when a mutant has no string status', function () {
        try {
            parseMutationReport({
                files: { 'source/a.ts': { mutants: [{ location: { start: { line: 1, column: 2 } } }] } }
            });
            assert.fail('Expected parseMutationReport() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'Mutation report contains a mutant without a string status');
        }
    });

    test('parseMutationReport preserves a valid mutant with status and location', function () {
        assert.deepStrictEqual(
            parseMutationReport({
                files: {
                    'source/a.ts': {
                        mutants: [{ status: 'Timeout', location: { start: { line: 3, column: 4 } } }]
                    }
                }
            }),
            {
                files: {
                    'source/a.ts': {
                        mutants: [{ status: 'Timeout', location: { start: { line: 3, column: 4 } } }]
                    }
                }
            }
        );
    });
});
