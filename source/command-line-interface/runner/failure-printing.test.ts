import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PublishFailure } from '../../packtory/packtory-results.ts';
import { printDryRunNote, printPublishFailure, printSuccessSummary } from './failure-printing.ts';

function captureLogger(): { readonly log: (message: string) => void; readonly messages: string[] } {
    const messages: string[] = [];
    return {
        log: (message) => {
            messages.push(message);
        },
        messages
    };
}

suite('failure-printing', function () {
    test('printDryRunNote does not log anything when noDryRun is true', function () {
        const sink = captureLogger();
        printDryRunNote(sink.log, { noDryRun: true });

        assert.deepStrictEqual(sink.messages, []);
    });

    test('printDryRunNote logs a single dry-run reminder when noDryRun is false', function () {
        const sink = captureLogger();
        printDryRunNote(sink.log, { noDryRun: false });

        assert.strictEqual(sink.messages.length, 1);
        assert.match(sink.messages[0] ?? '', /dry-run mode was enabled/u);
    });

    test('printPublishFailure formats config issues with bullet list when type is config', function () {
        const sink = captureLogger();
        const failure: PublishFailure = { type: 'config', issues: ['issue A', 'issue B'] };

        printPublishFailure(sink.log, failure);

        assert.strictEqual(sink.messages.length, 1);
        const message = sink.messages[0] ?? '';
        assert.match(message, /The provided config is invalid, there are 2 issue\(s\)/u);
        assert.match(message, /- issue A\n- issue B/u);
    });

    test('printPublishFailure formats check issues with bullet list when type is checks', function () {
        const sink = captureLogger();
        const failure: PublishFailure = { type: 'checks', issues: ['check X'] };

        printPublishFailure(sink.log, failure);

        const message = sink.messages[0] ?? '';
        assert.match(message, /Checks failed, there are 1 issue\(s\)/u);
        assert.match(message, /- check X/u);
    });

    test('printPublishFailure summarises partial failures when type is partial', function () {
        const sink = captureLogger();
        const failure: PublishFailure = {
            type: 'partial',
            succeeded: [{ name: 'pkg-a' }, { name: 'pkg-b' }] as never,
            failures: [{ message: 'pkg-c failed' }] as never
        };

        printPublishFailure(sink.log, failure);

        const message = sink.messages[0] ?? '';
        assert.ok(message.includes('package(s) failed'));
        assert.ok(message.includes('- pkg-c failed'));
    });

    test('printSuccessSummary logs the count of published packages', function () {
        const sink = captureLogger();

        printSuccessSummary(sink.log, [{ name: 'a' }, { name: 'b' }] as never);

        assert.match(sink.messages[0] ?? '', /all 2 package\(s\) have been published/u);
    });
});
