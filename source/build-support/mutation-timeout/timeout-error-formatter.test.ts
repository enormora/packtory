import assert from 'node:assert';
import { suite, test } from 'mocha';
import { formatMutationTimeoutError } from './timeout-error-formatter.ts';

suite('timeout-error-formatter', function () {
    test('formatMutationTimeoutError returns undefined when no timeout mutants exist', function () {
        assert.strictEqual(formatMutationTimeoutError([]), undefined);
    });

    test('formatMutationTimeoutError formats a singular header for one timeout mutant', function () {
        assert.strictEqual(
            formatMutationTimeoutError([{ filePath: 'source/a.ts', line: 3, column: 4 }]),
            ['Mutation report contains 1 timeout mutant.', '- source/a.ts:3:4'].join('\n')
        );
    });

    test('formatMutationTimeoutError pluralizes the header for multiple timeout mutants', function () {
        assert.strictEqual(
            formatMutationTimeoutError([
                { filePath: 'source/a.ts', line: 3, column: 4 },
                { filePath: 'source/b.ts', line: 5, column: 6 }
            ]),
            ['Mutation report contains 2 timeout mutants.', '- source/a.ts:3:4', '- source/b.ts:5:6'].join('\n')
        );
    });
});
