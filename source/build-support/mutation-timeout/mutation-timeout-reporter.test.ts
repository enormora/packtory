import assert from 'node:assert';
import path from 'node:path';
import { suite, test } from 'mocha';
import type { MutantResult } from '@stryker-mutator/api/core';
import { createMutationTimeoutReporter } from './mutation-timeout-reporter.ts';

const timeout: MutantResult = {
    id: 'mutation-1',
    fileName: '/workspace/source/a.ts',
    status: 'Timeout',
    mutatorName: 'BooleanLiteral',
    replacement: 'false',
    location: { start: { line: 7, column: 8 }, end: { line: 7, column: 12 } }
};

suite('mutation timeout reporting', function () {
    test('reports the relative source location and mutation identity immediately', function () {
        const messages: string[] = [];
        const reporter = createMutationTimeoutReporter(function (message) {
            messages.push(message);
        }, '/workspace');
        reporter.onMutantTested(timeout);

        assert.deepStrictEqual(messages, [
            `Mutation timed out: ${path.join('source', 'a.ts')}:7:8 (mutation-1, BooleanLiteral)`
        ]);
    });

    for (const status of [ 'Killed', 'Survived', 'NoCoverage' ] as const) {
        test(`does not report ${status} mutants as timeouts`, function () {
            const messages: string[] = [];
            const reporter = createMutationTimeoutReporter(function (message) {
                messages.push(message);
            }, '/workspace');
            reporter.onMutantTested({ ...timeout, status });

            assert.deepStrictEqual(messages, []);
        });
    }
});
