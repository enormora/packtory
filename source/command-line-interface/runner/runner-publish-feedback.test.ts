import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Result } from 'true-myth';
import { assertDeepSubset } from '../../test-libraries/deep-subset-assertion.ts';
import { createProgressBroadcaster, type ProgressBroadcaster } from '../../progress/progress-broadcaster.ts';
import { toOutcome } from '../../test-libraries/result-helpers.ts';
import {
    createRunner,
    noPublicationOutcome,
    type Overrides
} from '../../test-libraries/runner-test-support.ts';

suite('runner publish feedback', function () {
    async function expectRunnerToRethrow(overrides: Overrides, expectedMessage: string): Promise<void> {
        const runner = createRunner(overrides);
        try {
            await runner.run([ 'foo', 'bar', 'publish' ]);
            assert.fail('Expected run() should fail but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, expectedMessage);
        }
    }

    suite('throwing and issue output', function () {
        test('rethrows the error when buildAndPublishAll() throws', async function () {
            await expectRunnerToRethrow({ buildAndPublishAll: fake.rejects(new Error('foo')) }, 'foo');
        });

        async function runWithIssues(
            type: 'checks' | 'config',
            issues: readonly string[]
        ): Promise<{ readonly log: SinonSpy; }> {
            const buildAndPublishAll = fake.resolves(toOutcome(Result.err({ type, issues })));
            const log = fake();
            const runner = createRunner({ buildAndPublishAll, log });

            await runner.run([ 'foo', 'bar', 'publish' ]);
            return { log };
        }

        test('prints error summary when publish command encounters config errors', async function () {
            const { log } = await runWithIssues('config', [ 'foo' ]);
            assertDeepSubset(log, {
                callCount: 2,
                firstCall: {
                    args: [
                        '✖ The provided config is invalid, there are 1 issue(s)\n\n- foo'
                    ]
                }
            });
        });

        test('prints every config issue on its own bullet line', async function () {
            const { log } = await runWithIssues('config', [ 'foo', 'bar' ]);
            assert.deepStrictEqual(log.firstCall.args, [
                '✖ The provided config is invalid, there are 2 issue(s)\n\n- foo\n- bar'
            ]);
        });

        test('prints error summary when publish command encounters check errors', async function () {
            const { log } = await runWithIssues('checks', [ 'foo' ]);
            assertDeepSubset(log, {
                callCount: 2,
                firstCall: {
                    args: [ '✖ Checks failed, there are 1 issue(s)\n\n- foo' ]
                }
            });
        });

        test('prints every check issue on its own bullet line', async function () {
            const { log } = await runWithIssues('checks', [ 'foo', 'bar' ]);
            assert.deepStrictEqual(log.firstCall.args, [ '✖ Checks failed, there are 2 issue(s)\n\n- foo\n- bar' ]);
        });
    });

    suite('publish summaries', function () {
        const dryRunNote =
            '⚠  Note: dry-run mode was enabled, so there was nothing really published; add the --no-dry-run flag to disable dry-run mode';

        async function runPublishCapturingLog(
            buildAndPublishAll: SinonSpy,
            extraArgs: readonly string[] = []
        ): Promise<SinonSpy> {
            const log = fake();
            const runner = createRunner({ buildAndPublishAll, log });
            await runner.run([ 'foo', 'bar', 'publish', ...extraArgs ]);
            return log;
        }

        const partialResultWithTwoFailures = toOutcome(
            Result.err({
                type: 'partial' as const,
                succeeded: [ 'foo' ],
                failures: [ new Error('first'), new Error('second') ]
            })
        );

        test('prints error summary and dry-run note when publish command encounters partial errors', async function () {
            const log = await runPublishCapturingLog(fake.resolves(partialResultWithTwoFailures));

            assertDeepSubset(log, {
                callCount: 2,
                firstCall: {
                    args: [
                        '✖ 2 from 3 package(s) failed; 1 succeeded\n- first\n- second'
                    ]
                },
                secondCall: {
                    args: [ dryRunNote ]
                }
            });
        });

        test('prints error summary without dry-run note when publish command encounters partial errors and dry-run mode is disabled', async function () {
            const log = await runPublishCapturingLog(fake.resolves(partialResultWithTwoFailures), [ '--no-dry-run' ]);

            assertDeepSubset(log, {
                callCount: 1,
                firstCall: {
                    args: [
                        '✖ 2 from 3 package(s) failed; 1 succeeded\n- first\n- second'
                    ]
                }
            });
        });

        test('prints success summary and dry-run note when publish command had no errors', async function () {
            const log = await runPublishCapturingLog(fake.resolves(toOutcome(Result.ok([ 'foo', 'bar' ]))));

            assertDeepSubset(log, {
                callCount: 2,
                firstCall: {
                    args: [ '✔ Success: all 2 package(s) have been published' ]
                },
                secondCall: {
                    args: [ dryRunNote ]
                }
            });
        });

        test('prints success summary without dry-run note when publish command had no errors and dry-run mode is disabled', async function () {
            const log = await runPublishCapturingLog(fake.resolves(toOutcome(Result.ok([ 'foo', 'bar' ]))), [
                '--no-dry-run'
            ]);

            assertDeepSubset(log, {
                callCount: 1,
                firstCall: {
                    args: [ '✔ Success: all 2 package(s) have been published' ]
                }
            });
        });
    });

    suite('spinners and progress', function () {
        test('stops all spinners when buildAndPublishAll throws', async function () {
            const stopAll = fake();
            await expectRunnerToRethrow(
                { buildAndPublishAll: fake.rejects(new Error('foo')), spinnerRenderer: { stopAll } },
                'foo'
            );
            assert.strictEqual(stopAll.callCount, 1);
        });

        test('stops all spinners when buildAndPublishAll finishes without errors', async function () {
            const stopAll = fake();
            const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
            const runner = createRunner({ buildAndPublishAll, spinnerRenderer: { stopAll } });

            await runner.run([ 'foo', 'bar', 'publish' ]);
            assert.strictEqual(stopAll.callCount, 1);
        });

        test('adds a spinner when progressBroadcaster receives a "scheduled" event', async function () {
            const add = fake();
            const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
            const progressBroadcaster = createProgressBroadcaster();
            const runner = createRunner({ buildAndPublishAll, spinnerRenderer: { add }, progressBroadcaster });

            await runner.run([ 'foo', 'bar', 'publish' ]);
            progressBroadcaster.provider.emit('scheduled', { packageName: 'foo' });

            assertDeepSubset(add, {
                callCount: 1,
                firstCall: {
                    args: [ 'foo', 'foo', 'Scheduled …' ]
                }
            });
        });

        async function runWithProgressEvent(
            spinnerRenderer: NonNullable<Overrides['spinnerRenderer']>,
            eventName: Parameters<ProgressBroadcaster['provider']['emit']>[0],
            eventPayload: Parameters<ProgressBroadcaster['provider']['emit']>[1]
        ): Promise<ProgressBroadcaster> {
            const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
            const progressBroadcaster = createProgressBroadcaster();
            const runner = createRunner({ buildAndPublishAll, spinnerRenderer, progressBroadcaster });

            await runner.run([ 'foo', 'bar', 'publish' ]);
            progressBroadcaster.provider.emit(eventName, eventPayload);
            return progressBroadcaster;
        }

        test('stops a running spinner with failure status when progressBroadcaster receives an "error" event', async function () {
            const stop = fake();
            await runWithProgressEvent({ stop }, 'error', { packageName: 'foo', error: new Error('bar') });

            assertDeepSubset(stop, {
                callCount: 1,
                firstCall: {
                    args: [ 'foo', 'failure', 'bar' ]
                }
            });
        });

        test('stops a running spinner with success status when progressBroadcaster receives an "done" event and already-published status', async function () {
            const stop = fake();
            await runWithProgressEvent({ stop }, 'done', {
                packageName: 'foo',
                version: '1',
                status: 'already-published',
                publication: noPublicationOutcome
            });

            assertDeepSubset(stop, {
                callCount: 1,
                firstCall: {
                    args: [
                        'foo',
                        'success',
                        'Nothing has changed, published version 1 is already up-to-date'
                    ]
                }
            });
        });

        test('stops a running spinner with success status when progressBroadcaster receives an "done" event and initial-version status', async function () {
            const stop = fake();
            await runWithProgressEvent({ stop }, 'done', {
                packageName: 'foo',
                version: '1',
                status: 'initial-version',
                publication: noPublicationOutcome
            });

            assertDeepSubset(stop, {
                callCount: 1,
                firstCall: {
                    args: [ 'foo', 'success', 'First version 1 has been published' ]
                }
            });
        });

        test('stops a running spinner with success status when progressBroadcaster receives an "done" event and new-version status', async function () {
            const stop = fake();
            await runWithProgressEvent({ stop }, 'done', {
                packageName: 'foo',
                version: '1',
                status: 'new-version',
                publication: noPublicationOutcome
            });

            assertDeepSubset(stop, {
                callCount: 1,
                firstCall: {
                    args: [ 'foo', 'success', 'New version 1 published' ]
                }
            });
        });

        test('updates a running spinner message when a "building" event is received', async function () {
            const updateMessage = fake();
            await runWithProgressEvent({ updateMessage }, 'building', { packageName: 'foo', version: '1' });

            assertDeepSubset(updateMessage, {
                callCount: 1,
                firstCall: {
                    args: [ 'foo', 'Building package with version 1' ]
                }
            });
        });

        test('updates a running spinner message when a "rebuilding" event is received', async function () {
            const updateMessage = fake();
            await runWithProgressEvent({ updateMessage }, 'rebuilding', { packageName: 'foo', version: '1' });

            assertDeepSubset(updateMessage, {
                callCount: 1,
                firstCall: {
                    args: [ 'foo', 'Rebuilding package with version 1' ]
                }
            });
        });
    });
});
