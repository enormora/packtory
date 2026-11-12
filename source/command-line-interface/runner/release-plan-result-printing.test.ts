import assert from 'node:assert';
import { suite, test } from 'mocha';
import { printReleasePlanFailure } from './release-plan-result-printing.ts';

suite('release-plan-result-printing', function () {
    test('includes failure stack traces when requested', function () {
        const messages: string[] = [];
        printReleasePlanFailure(function (message) {
            messages.push(message);
        }, {
            skipped: [],
            type: 'partial',
            succeeded: [],
            failures: [ new Error('planning failed') ]
        }, true);
        assert.match(messages.join('\n'), /- planning failed\n {2}Stack trace: Error: planning failed/u);
    });
});
