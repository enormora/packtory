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
    location: {
        start: {
            line: 7,
            column: 8
        },
        end: {
            line: 7,
            column: 12
        }
    }
};
const sourceLocation = `${path.join('source', 'a.ts')}:7:8 (mutation-1, BooleanLiteral)`;

suite('mutation failure reporting', function () {
    for (
        const {
            status,
            isStatic,
            message
        } of [ {
            status: 'Timeout',
            isStatic: false,
            message: `Mutation timed out: ${sourceLocation}`
        }, {
            status: 'Survived',
            isStatic: false,
            message: `Mutation survived: ${sourceLocation}`
        }, {
            status: 'Timeout',
            isStatic: true,
            message: `Mutation timed out: ${sourceLocation} [static]`
        }, {
            status: 'Survived',
            isStatic: true,
            message: `Mutation survived: ${sourceLocation} [static]`
        } ] as const
    ) {
        test(`reports ${status} with static=${String(isStatic)} immediately`, function () {
            const messages: string[] = [];
            const reporter = createMutationTimeoutReporter(function (reportedMessage) {
                messages.push(reportedMessage);
            }, '/workspace');
            reporter.onMutantTested({
                ...timeout,
                status,
                static: isStatic
            });
            assert.deepStrictEqual(messages, [ message ]);
        });
    }
    for (const status of [ 'Killed', 'NoCoverage' ] as const) {
        test(`does not report ${status} mutants as failures`, function () {
            const messages: string[] = [];
            const reporter = createMutationTimeoutReporter(function (reportedMessage) {
                messages.push(reportedMessage);
            }, '/workspace');
            reporter.onMutantTested({
                ...timeout,
                status
            });
            assert.deepStrictEqual(messages, []);
        });
    }
});
