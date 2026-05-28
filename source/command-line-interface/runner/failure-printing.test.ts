import assert from 'node:assert';
import { suite, test } from 'mocha';
import { dim } from 'yoctocolors';
import { noPublication, stagedForApproval } from '../../bundle-emitter/publication-outcome.ts';
import type { PublishFailure } from '../../packtory/packtory-results.ts';
import { printDryRunNote, printPublishFailure, printSuccessSummary } from './failure-printing.ts';
import { getSuccessSymbol } from './runner-symbols.ts';

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

        printPublishFailure(sink.log, failure, { stage: false });

        assert.strictEqual(sink.messages.length, 1);
        const message = sink.messages[0] ?? '';
        assert.match(message, /The provided config is invalid, there are 2 issue\(s\)/u);
        assert.match(message, /- issue A\n- issue B/u);
    });

    test('printPublishFailure formats check issues with bullet list when type is checks', function () {
        const sink = captureLogger();
        const failure: PublishFailure = { type: 'checks', issues: ['check X'] };

        printPublishFailure(sink.log, failure, { stage: false });

        const message = sink.messages[0] ?? '';
        assert.match(message, /Checks failed, there are 1 issue\(s\)/u);
        assert.match(message, /- check X/u);
    });

    test('printPublishFailure summarises partial failures when type is partial', function () {
        const sink = captureLogger();
        const failure: PublishFailure = {
            type: 'partial',
            succeeded: [
                { bundle: { name: 'pkg-a', version: '1.0.0' }, publication: stagedForApproval('stage-a') },
                { bundle: { name: 'pkg-b', version: '1.0.0' }, publication: noPublication }
            ] as never,
            failures: [{ message: 'pkg-c failed' }] as never
        };

        printPublishFailure(sink.log, failure, { stage: true });

        assert.ok((sink.messages[0] ?? '').includes('package(s) failed'));
        assert.ok((sink.messages[0] ?? '').includes('- pkg-c failed'));
        assert.deepStrictEqual(sink.messages[1], 'Staged packages:\n- pkg-a@1.0.0: stage-a');
    });

    test('printPublishFailure omits the staged package list when no partial successes were staged', function () {
        const sink = captureLogger();
        const failure: PublishFailure = {
            type: 'partial',
            succeeded: [{ bundle: { name: 'pkg-a', version: '1.0.0' }, publication: noPublication }] as never,
            failures: [{ message: 'pkg-b failed' }] as never
        };

        printPublishFailure(sink.log, failure, { stage: true });

        assert.strictEqual(sink.messages.length, 1);
        assert.ok((sink.messages[0] ?? '').includes('- pkg-b failed'));
    });

    test('printSuccessSummary logs the count of published packages', function () {
        const sink = captureLogger();

        printSuccessSummary(sink.log, [{ name: 'a' }, { name: 'b' }] as never, { stage: false });

        assert.strictEqual(sink.messages[0], `${getSuccessSymbol()} Success: all 2 package(s) have been published`);
    });

    test('printSuccessSummary logs stage ids for staged packages', function () {
        const sink = captureLogger();

        printSuccessSummary(
            sink.log,
            [
                {
                    bundle: { name: 'a', version: '1.0.0' },
                    publication: stagedForApproval('stage-a'),
                    status: 'new-version'
                },
                {
                    bundle: { name: 'b', version: '1.0.0' },
                    publication: noPublication,
                    status: 'already-published'
                }
            ] as never,
            { stage: true }
        );

        assert.strictEqual(
            sink.messages[0],
            `${getSuccessSymbol()} Success: staged 1 package(s); ${dim('1')} already up-to-date`
        );
        assert.strictEqual(sink.messages[1], 'Staged packages:\n- a@1.0.0: stage-a');
    });

    test('printSuccessSummary omits the unchanged suffix when every successful package was staged', function () {
        const sink = captureLogger();

        printSuccessSummary(
            sink.log,
            [
                {
                    bundle: { name: 'a', version: '1.0.0' },
                    publication: stagedForApproval('stage-a'),
                    status: 'new-version'
                }
            ] as never,
            { stage: true }
        );

        assert.strictEqual(sink.messages[0], `${getSuccessSymbol()} Success: staged 1 package(s)`);
        assert.strictEqual(sink.messages[1], 'Staged packages:\n- a@1.0.0: stage-a');
    });

    test('printSuccessSummary reports when stage mode found nothing to stage', function () {
        const sink = captureLogger();

        printSuccessSummary(
            sink.log,
            [
                { bundle: { name: 'a', version: '1.0.0' }, publication: noPublication, status: 'already-published' }
            ] as never,
            { stage: true }
        );

        assert.strictEqual(
            sink.messages[0],
            `${getSuccessSymbol()} Success: no packages were staged; all 1 package(s) were already up-to-date`
        );
        assert.strictEqual(sink.messages.length, 1);
    });
});
