import assert from 'node:assert';
import { suite, test } from 'mocha';
import { formatCanarySummary, warningAnnotationMessages } from './canary-summary.ts';
import type { CanaryRunResult } from './canary-runner.ts';

const ansiRed = `${String.fromCodePoint(0x1B)}[31m`;
const ansiReset = `${String.fromCodePoint(0x1B)}[39m`;
const escapeCharacter = String.fromCodePoint(0x1B);
const deleteCharacter = String.fromCodePoint(0x7F);
const nonFinalAnsiByte = String.fromCodePoint(0x1F);
const issueTitleLimit = 200;
const longTitleLength = 201;
const whitespaceOnlyLine = ' '.repeat(3);
const escapedDeleteBoundaryLeak = [ 'm', 'delete boundary' ].join('');

function resultWithIssues(issues: CanaryRunResult['issues']): CanaryRunResult {
    return {
        baselineResolvedRef: 'base',
        candidateResolvedRef: 'candidate',
        issues,
        name: 'sample'
    };
}

suite('canary-summary', function () {
    test('formatCanarySummary renders counts and readable issue details', function () {
        assert.strictEqual(
            formatCanarySummary(resultWithIssues([
                { kind: 'regression', message: 'missing api' },
                {
                    kind: 'baseline-rot',
                    message: [
                        `${ansiRed}baseline failed${ansiReset}`,
                        '/workspace/packtory-canary-overkill-baseline-abcd/file.js'
                    ]
                        .join('\n')
                },
                {
                    kind: 'warning',
                    message: [
                        'warning line',
                        '',
                        whitespaceOnlyLine,
                        'trimmed   '
                    ]
                        .join('\n')
                }
            ])),
            [
                '## Packtory canary: sample',
                '',
                '- Baseline ref: base',
                '- Source ref: candidate',
                '- Regressions: 1',
                '- Baseline rot: 1',
                '- Warnings: 1',
                '',
                '### Issues',
                '',
                '<details open>',
                '<summary>1. regression: missing api</summary>',
                '',
                '~~~text',
                'missing api',
                '~~~',
                '',
                '</details>',
                '<details>',
                '<summary>2. baseline-rot: baseline failed</summary>',
                '',
                '~~~text',
                'baseline failed',
                '/workspace/<canary-clone>-overkill-baseline-abcd/file.js',
                '~~~',
                '',
                '</details>',
                '<details>',
                '<summary>3. warning: warning line</summary>',
                '',
                '~~~text',
                'warning line',
                'trimmed',
                '~~~',
                '',
                '</details>',
                ''
            ]
                .join('\n')
        );
    });

    test('formatCanarySummary renders an empty issue state', function () {
        assert.strictEqual(
            formatCanarySummary(resultWithIssues([])),
            [
                '## Packtory canary: sample',
                '',
                '- Baseline ref: base',
                '- Source ref: candidate',
                '- Regressions: 0',
                '- Baseline rot: 0',
                '- Warnings: 0',
                '',
                '### Issues',
                '',
                'No canary issues found.',
                ''
            ]
                .join('\n')
        );
    });

    test('formatCanarySummary only strips ANSI escape sequences', function () {
        const message = [
            `${escapeCharacter}[@insert boundary`,
            `${escapeCharacter}[~tilde boundary`,
            'literal [31m text',
            `${escapeCharacter}not an ansi sequence`,
            `${escapeCharacter}[${deleteCharacter}${escapedDeleteBoundaryLeak}`
        ]
            .join('\n');
        const unterminatedMessage = `${escapeCharacter}[${nonFinalAnsiByte}`;
        const summary = formatCanarySummary(resultWithIssues([
            { kind: 'warning', message },
            { kind: 'warning', message: unterminatedMessage }
        ]));

        assert.match(summary, /insert boundary/u);
        assert.match(summary, /tilde boundary/u);
        assert.match(summary, /literal \[31m text/u);
        assert.match(summary, /not an ansi sequence/u);
        assert.match(summary, /\(empty message\)/u);
        assert.strictEqual(summary.includes(escapedDeleteBoundaryLeak), false);
        assert.strictEqual(summary.includes(nonFinalAnsiByte), false);
    });

    test('warningAnnotationMessages prefixes canary names and shortens details', function () {
        const longTitle = 'x'.repeat(longTitleLength);
        const boundaryTitle = 'y'.repeat(issueTitleLimit);

        assert.deepStrictEqual(
            warningAnnotationMessages(resultWithIssues([
                { kind: 'warning', message: 'changed type text\nsecond line\nthird line\nfourth line' },
                { kind: 'regression', message: longTitle },
                { kind: 'baseline-rot', message: boundaryTitle }
            ])),
            [
                'sample: 1. warning: changed type text',
                `sample: 2. regression: ${'x'.repeat(longTitleLength - 1)}...`,
                `sample: 3. baseline-rot: ${boundaryTitle}`
            ]
        );
    });
});
