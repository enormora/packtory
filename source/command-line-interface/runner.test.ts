import assert from 'node:assert';
import { stripVTControlCharacters } from 'node:util';
import { test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Result } from 'true-myth';
import { createProgressBroadcaster, type ProgressBroadcaster } from '../progress/progress-broadcaster.ts';
import { toOutcome } from '../test-libraries/result-helpers.ts';
import {
    createCommandLineInterfaceRunner,
    type CommandLineInterfaceRunner,
    type CommandLineInterfaceRunnerDependencies
} from './runner.ts';

type Overrides = {
    readonly buildAndPublishAll?: SinonSpy;
    readonly loadConfig?: SinonSpy;
    readonly log?: SinonSpy;
    readonly writeReportFile?: SinonSpy;
    readonly pageOutput?: SinonSpy;
    readonly openFile?: SinonSpy;
    readonly createTemporaryFilePath?: () => string;
    progressBroadcaster?: ProgressBroadcaster;
    spinnerRenderer?: {
        add?: SinonSpy;
        stop?: SinonSpy;
        updateMessage?: SinonSpy;
        stopAll?: SinonSpy;
    };
};

function createSpy<TSpy extends SinonSpy>(spy: TSpy | undefined, fallback: () => TSpy): TSpy {
    return spy ?? fallback();
}

function createSpinnerRenderer(
    overrides: Overrides['spinnerRenderer'] = {}
): CommandLineInterfaceRunnerDependencies['spinnerRenderer'] {
    const add = createSpy(overrides.add, fake);
    const stop = createSpy(overrides.stop, fake);
    const updateMessage = createSpy(overrides.updateMessage, fake);
    const stopAll = createSpy(overrides.stopAll, fake);

    return {
        add: (...args) => {
            add(...args);
        },
        stop: (...args) => {
            stop(...args);
        },
        updateMessage: (...args) => {
            updateMessage(...args);
        },
        stopAll: () => {
            stopAll();
        }
    };
}

function runnerFactory(overrides: Overrides = {}): CommandLineInterfaceRunner {
    const progressBroadcaster = overrides.progressBroadcaster ?? createProgressBroadcaster();
    const log = createSpy(overrides.log, fake);
    const pageOutput = overrides.pageOutput ?? fake.resolves(undefined);
    const dependencies: CommandLineInterfaceRunnerDependencies = {
        packtory: {
            buildAndPublishAll: createSpy(overrides.buildAndPublishAll, () => {
                return fake.resolves(undefined);
            }),
            resolveAndLinkAll: fake.resolves(toOutcome(Result.ok([])))
        },
        log: (message) => {
            log(stripVTControlCharacters(message));
        },
        configLoader: {
            load: createSpy(overrides.loadConfig, () => {
                return fake.resolves(undefined);
            })
        },
        progressBroadcaster: progressBroadcaster.consumer,
        spinnerRenderer: createSpinnerRenderer(overrides.spinnerRenderer),
        writeReportFile: createSpy(overrides.writeReportFile, () => {
            return fake.resolves(undefined);
        }),
        pageOutput: async (message) => {
            pageOutput(stripVTControlCharacters(message));
        },
        openFile: createSpy(overrides.openFile, () => {
            return fake.resolves(true);
        }),
        createTemporaryFilePath: overrides.createTemporaryFilePath ?? (() => '/tmp/packtory-preview.html')
    };

    return createCommandLineInterfaceRunner(dependencies);
}

test('publish command loads the config file and passes it to buildAndPublishAll()', async () => {
    const loadConfig = fake.resolves('the-config');
    const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
    const runner = runnerFactory({ loadConfig, buildAndPublishAll });

    await runner.run(['foo', 'bar', 'publish']);

    assert.strictEqual(loadConfig.callCount, 1);
    assert.strictEqual(buildAndPublishAll.callCount, 1);
    assert.strictEqual(buildAndPublishAll.firstCall.args[0], 'the-config');
});

test('publish command runs in dry-run mode per default', async () => {
    const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
    const runner = runnerFactory({ buildAndPublishAll });

    await runner.run(['foo', 'bar', 'publish']);

    assert.strictEqual(buildAndPublishAll.callCount, 1);
    assert.deepStrictEqual(buildAndPublishAll.firstCall.args[1], { dryRun: true, collectReport: false });
});

test('publish command runs not in dry-run mode when no-dry-run flag is set', async () => {
    const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
    const runner = runnerFactory({ buildAndPublishAll });

    await runner.run(['foo', 'bar', 'publish', '--no-dry-run']);

    assert.strictEqual(buildAndPublishAll.callCount, 1);
    assert.deepStrictEqual(buildAndPublishAll.firstCall.args[1], { dryRun: false, collectReport: false });
});

test('preview command loads the config file and passes it to buildAndPublishAll()', async () => {
    const loadConfig = fake.resolves('the-config');
    const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
    const runner = runnerFactory({ loadConfig, buildAndPublishAll });

    await runner.run(['foo', 'bar', 'preview']);

    assert.strictEqual(loadConfig.callCount, 1);
    assert.strictEqual(buildAndPublishAll.callCount, 1);
    assert.strictEqual(buildAndPublishAll.firstCall.args[0], 'the-config');
});

test('preview command always runs in dry-run mode with collectReport enabled', async () => {
    const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
    const runner = runnerFactory({ buildAndPublishAll });

    await runner.run(['foo', 'bar', 'preview']);

    assert.deepStrictEqual(buildAndPublishAll.firstCall.args[1], { dryRun: true, collectReport: true });
});

test('returns exit code 0 when publish command had no errors', async () => {
    const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
    const runner = runnerFactory({ buildAndPublishAll });

    const exitCode = await runner.run(['foo', 'bar', 'publish']);

    assert.strictEqual(exitCode, 0);
});

test('returns exit code 1 when publish command has errors', async () => {
    const buildAndPublishAll = fake.resolves(toOutcome(Result.err({ type: 'config', issues: [] })));
    const runner = runnerFactory({ buildAndPublishAll });

    const exitCode = await runner.run(['foo', 'bar', 'publish']);

    assert.strictEqual(exitCode, 1);
});

test('returns exit code 1 instead of exiting the process when command parsing fails', async () => {
    const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
    const log = fake();
    const runner = runnerFactory({ buildAndPublishAll, log });

    const exitCode = await runner.run(['foo', 'bar', 'not-a-command']);

    assert.strictEqual(exitCode, 1);
    assert.strictEqual(buildAndPublishAll.callCount, 0);
    assert.strictEqual(log.callCount, 1);
    assert.match(String(log.firstCall.args[0]), /packtory --help/);
});

test('returns exit code 1 when the publish command name is misspelled', async () => {
    const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
    const runner = runnerFactory({ buildAndPublishAll });

    const exitCode = await runner.run(['foo', 'bar', 'publis']);

    assert.strictEqual(exitCode, 1);
    assert.strictEqual(buildAndPublishAll.callCount, 0);
});

test('prints command help that includes the publish command name and description', async () => {
    const log = fake();
    const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
    const runner = runnerFactory({ buildAndPublishAll, log });

    const exitCode = await runner.run(['foo', 'bar', '--help']);

    assert.strictEqual(exitCode, 0);
    assert.ok(
        String(log.firstCall.args[0]).includes('publish'),
        'Expected help output to include the publish command name'
    );
    assert.ok(
        String(log.firstCall.args[0]).includes('Builds and publishes all packages (dry-run enabled by default).'),
        'Expected help output to include the publish command description'
    );
    assert.ok(String(log.firstCall.args[0]).includes('preview'), 'Expected help output to include the preview command');
});

test('prints subcommand help that includes the full publish command path', async () => {
    const log = fake();
    const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
    const runner = runnerFactory({ buildAndPublishAll, log });

    const exitCode = await runner.run(['foo', 'bar', 'publish', '--help']);

    assert.strictEqual(exitCode, 0);
    assert.match(String(log.firstCall.args[0]), /packtory publish/);
});

test('prints subcommand help that includes the full preview command path and --open flag', async () => {
    const log = fake();
    const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
    const runner = runnerFactory({ buildAndPublishAll, log });

    const exitCode = await runner.run(['foo', 'bar', 'preview', '--help']);

    assert.strictEqual(exitCode, 0);
    assert.match(String(log.firstCall.args[0]), /packtory preview/);
    assert.match(String(log.firstCall.args[0]), /--open/);
});

async function expectRunnerToRethrow(overrides: Overrides, expectedMessage: string): Promise<void> {
    const runner = runnerFactory(overrides);
    try {
        await runner.run(['foo', 'bar', 'publish']);
        assert.fail('Expected run() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, expectedMessage);
    }
}

test('rethrows the error when buildAndPublishAll() throws', async () => {
    await expectRunnerToRethrow({ buildAndPublishAll: fake.rejects(new Error('foo')) }, 'foo');
});

async function runWithIssues(
    type: 'checks' | 'config',
    issues: readonly string[]
): Promise<{ readonly log: SinonSpy }> {
    const buildAndPublishAll = fake.resolves(toOutcome(Result.err({ type, issues })));
    const log = fake();
    const runner = runnerFactory({ buildAndPublishAll, log });

    await runner.run(['foo', 'bar', 'publish']);
    return { log };
}

test('prints error summary when publish command encounters config errors', async () => {
    const { log } = await runWithIssues('config', ['foo']);
    assert.strictEqual(log.callCount, 2);
    assert.deepStrictEqual(log.firstCall.args, ['✖ The provided config is invalid, there are 1 issue(s)\n\n- foo']);
});

test('prints every config issue on its own bullet line', async () => {
    const { log } = await runWithIssues('config', ['foo', 'bar']);
    assert.deepStrictEqual(log.firstCall.args, [
        '✖ The provided config is invalid, there are 2 issue(s)\n\n- foo\n- bar'
    ]);
});

test('prints error summary when publish command encounters check errors', async () => {
    const { log } = await runWithIssues('checks', ['foo']);
    assert.strictEqual(log.callCount, 2);
    assert.deepStrictEqual(log.firstCall.args, ['✖ Checks failed, there are 1 issue(s)\n\n- foo']);
});

test('prints every check issue on its own bullet line', async () => {
    const { log } = await runWithIssues('checks', ['foo', 'bar']);
    assert.deepStrictEqual(log.firstCall.args, ['✖ Checks failed, there are 2 issue(s)\n\n- foo\n- bar']);
});

const dryRunNote =
    '⚠  Note: dry-run mode was enabled, so there was nothing really published; add the --no-dry-run flag to disable dry-run mode';

async function runPublishCapturingLog(
    buildAndPublishAll: SinonSpy,
    extraArgs: readonly string[] = []
): Promise<SinonSpy> {
    const log = fake();
    const runner = runnerFactory({ buildAndPublishAll, log });
    await runner.run(['foo', 'bar', 'publish', ...extraArgs]);
    return log;
}

const partialResultWithTwoFailures = toOutcome(
    Result.err({
        type: 'partial' as const,
        succeeded: ['foo'],
        failures: [new Error('first'), new Error('second')]
    })
);

test('prints error summary and dry-run note when publish command encounters partial errors', async () => {
    const log = await runPublishCapturingLog(fake.resolves(partialResultWithTwoFailures));

    assert.strictEqual(log.callCount, 2);
    assert.deepStrictEqual(log.firstCall.args, ['✖ 2 from 3 package(s) failed; 1 succeeded']);
    assert.deepStrictEqual(log.secondCall.args, [dryRunNote]);
});

test('prints error summary without dry-run note when publish command encounters partial errors and dry-run mode is disabled', async () => {
    const log = await runPublishCapturingLog(fake.resolves(partialResultWithTwoFailures), ['--no-dry-run']);

    assert.strictEqual(log.callCount, 1);
    assert.deepStrictEqual(log.firstCall.args, ['✖ 2 from 3 package(s) failed; 1 succeeded']);
});

test('prints success summary and dry-run note when publish command had no errors', async () => {
    const log = await runPublishCapturingLog(fake.resolves(toOutcome(Result.ok(['foo', 'bar']))));

    assert.strictEqual(log.callCount, 2);
    assert.deepStrictEqual(log.firstCall.args, ['✔ Success: all 2 package(s) have been published']);
    assert.deepStrictEqual(log.secondCall.args, [dryRunNote]);
});

test('prints success summary without dry-run note when publish command had no errors and dry-run mode is disabled', async () => {
    const log = await runPublishCapturingLog(fake.resolves(toOutcome(Result.ok(['foo', 'bar']))), ['--no-dry-run']);

    assert.strictEqual(log.callCount, 1);
    assert.deepStrictEqual(log.firstCall.args, ['✔ Success: all 2 package(s) have been published']);
});

test('stops all spinners when buildAndPublishAll throws', async () => {
    const stopAll = fake();
    await expectRunnerToRethrow(
        { buildAndPublishAll: fake.rejects(new Error('foo')), spinnerRenderer: { stopAll } },
        'foo'
    );
    assert.strictEqual(stopAll.callCount, 1);
});

test('stops all spinners when buildAndPublishAll finishes without errors', async () => {
    const stopAll = fake();
    const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
    const runner = runnerFactory({ buildAndPublishAll, spinnerRenderer: { stopAll } });

    await runner.run(['foo', 'bar', 'publish']);
    assert.ok(stopAll.callCount >= 1);
});

test('adds a spinner when progressBroadcaster receives a "scheduled" event', async () => {
    const add = fake();
    const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
    const progressBroadcaster = createProgressBroadcaster();
    const runner = runnerFactory({ buildAndPublishAll, spinnerRenderer: { add }, progressBroadcaster });

    await runner.run(['foo', 'bar', 'publish']);
    progressBroadcaster.provider.emit('scheduled', { packageName: 'foo' });

    assert.strictEqual(add.callCount, 1);
    assert.deepStrictEqual(add.firstCall.args, ['foo', 'foo', 'Scheduled …']);
});

async function runWithProgressEvent(
    spinnerRenderer: NonNullable<Overrides['spinnerRenderer']>,
    eventName: string,
    eventPayload: unknown
): Promise<ProgressBroadcaster> {
    const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
    const progressBroadcaster = createProgressBroadcaster();
    const runner = runnerFactory({ buildAndPublishAll, spinnerRenderer, progressBroadcaster });

    await runner.run(['foo', 'bar', 'publish']);
    progressBroadcaster.provider.emit(eventName as never, eventPayload as never);
    return progressBroadcaster;
}

test('stops a running spinner with failure status when progressBroadcaster receives an "error" event', async () => {
    const stop = fake();
    await runWithProgressEvent({ stop }, 'error', { packageName: 'foo', error: new Error('bar') });

    assert.strictEqual(stop.callCount, 1);
    assert.deepStrictEqual(stop.firstCall.args, ['foo', 'failure', 'bar']);
});

test('stops a running spinner with success status when progressBroadcaster receives an "done" event and already-published status', async () => {
    const stop = fake();
    await runWithProgressEvent({ stop }, 'done', { packageName: 'foo', version: '1', status: 'already-published' });

    assert.strictEqual(stop.callCount, 1);
    assert.deepStrictEqual(stop.firstCall.args, [
        'foo',
        'success',
        'Nothing has changed, published version 1 is already up-to-date'
    ]);
});

test('stops a running spinner with success status when progressBroadcaster receives an "done" event and initial-version status', async () => {
    const stop = fake();
    await runWithProgressEvent({ stop }, 'done', { packageName: 'foo', version: '1', status: 'initial-version' });

    assert.strictEqual(stop.callCount, 1);
    assert.deepStrictEqual(stop.firstCall.args, ['foo', 'success', 'First version 1 has been published']);
});

test('stops a running spinner with success status when progressBroadcaster receives an "done" event and new-version status', async () => {
    const stop = fake();
    await runWithProgressEvent({ stop }, 'done', { packageName: 'foo', version: '1', status: 'new-version' });

    assert.strictEqual(stop.callCount, 1);
    assert.deepStrictEqual(stop.firstCall.args, ['foo', 'success', 'New version 1 published']);
});

test('updates a running spinner message when a "building" event is received', async () => {
    const updateMessage = fake();
    await runWithProgressEvent({ updateMessage }, 'building', { packageName: 'foo', version: '1' });

    assert.strictEqual(updateMessage.callCount, 1);
    assert.deepStrictEqual(updateMessage.firstCall.args, ['foo', 'Building package with version 1']);
});

test('updates a running spinner message when a "rebuilding" event is received', async () => {
    const updateMessage = fake();
    await runWithProgressEvent({ updateMessage }, 'rebuilding', { packageName: 'foo', version: '1' });

    assert.strictEqual(updateMessage.callCount, 1);
    assert.deepStrictEqual(updateMessage.firstCall.args, ['foo', 'Rebuilding package with version 1']);
});

const sampleReport = {
    schemaVersion: 1 as const,
    generatedAt: '2026-05-11T00:00:00.000Z',
    packages: {
        'pkg-a': {
            decisions: {
                version: {
                    previousVersion: '1.0.0',
                    chosenVersion: '1.0.1',
                    trigger: 'auto-patch-bump' as const
                }
            },
            outputs: {
                tarball: {
                    totalBytes: 20,
                    entries: [
                        { path: 'package.json', sizeBytes: 2, kind: 'manifest' as const, status: 'generated' as const, badges: [] },
                        {
                            path: 'index.js',
                            sizeBytes: 18,
                            kind: 'source' as const,
                            sourcePath: '/workspace/index.js',
                            status: 'changed' as const,
                            badges: ['dead-code-elimination' as const]
                        }
                    ]
                }
            },
            timings: {}
        }
    },
    aggregate: { crossBundleLinks: [] }
};

function outcomeWithReport(result: unknown): {
    readonly result: unknown;
    readonly getReport: () => typeof sampleReport;
} {
    return {
        result,
        getReport: () => {
            return sampleReport;
        }
    };
}

test('publish with --report-json requests collectReport: true', async () => {
    const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
    const runner = runnerFactory({ buildAndPublishAll });

    await runner.run(['foo', 'bar', 'publish', '--report-json']);

    assert.deepStrictEqual(buildAndPublishAll.firstCall.args[1], { dryRun: true, collectReport: true });
});

test('publish with --report-html requests collectReport: true', async () => {
    const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
    const runner = runnerFactory({ buildAndPublishAll });

    await runner.run(['foo', 'bar', 'publish', '--report-html']);

    assert.deepStrictEqual(buildAndPublishAll.firstCall.args[1], { dryRun: true, collectReport: true });
});

async function runPublishWithReport(extraArgs: readonly string[]): Promise<SinonSpy> {
    const writeReportFile = fake.resolves(undefined);
    const buildAndPublishAll = fake.resolves(outcomeWithReport(Result.ok([])));
    const runner = runnerFactory({ buildAndPublishAll, writeReportFile });
    await runner.run(['foo', 'bar', 'publish', ...extraArgs]);
    return writeReportFile;
}

test('publish writes packtory-report.json when --report-json is set and getReport returns a report', async () => {
    const writeReportFile = await runPublishWithReport(['--report-json']);

    assert.strictEqual(writeReportFile.callCount, 1);
    assert.strictEqual(writeReportFile.firstCall.args[0], 'packtory-report.json');
    const writtenContent = String(writeReportFile.firstCall.args[1]);
    assert.ok(writtenContent.endsWith('\n'), 'json report must end with a newline');
    assert.deepStrictEqual(JSON.parse(writtenContent), sampleReport);
});

test('publish writes packtory-report.html when --report-html is set and getReport returns a report', async () => {
    const writeReportFile = await runPublishWithReport(['--report-html']);

    assert.strictEqual(writeReportFile.callCount, 1);
    assert.strictEqual(writeReportFile.firstCall.args[0], 'packtory-report.html');
    const writtenContent = String(writeReportFile.firstCall.args[1]);
    assert.ok(writtenContent.startsWith('<!doctype html>'), 'html report must start with doctype');
});

test('publish writes both report files when --report-json and --report-html are set', async () => {
    const writeReportFile = await runPublishWithReport(['--report-json', '--report-html']);

    const writtenPaths = writeReportFile.getCalls().map((call): unknown => {
        return call.args[0];
    });
    assert.deepStrictEqual(writtenPaths, ['packtory-report.json', 'packtory-report.html']);
});

test('publish writes no report files when neither flag is set', async () => {
    const writeReportFile = await runPublishWithReport([]);

    assert.strictEqual(writeReportFile.callCount, 0);
});

test('publish writes no report files when getReport returns undefined even with --report-json set', async () => {
    const writeReportFile = fake.resolves(undefined);
    const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
    const runner = runnerFactory({ buildAndPublishAll, writeReportFile });

    await runner.run(['foo', 'bar', 'publish', '--report-json']);

    assert.strictEqual(writeReportFile.callCount, 0);
});

test('publish writes the report even when the build failed', async () => {
    const writeReportFile = fake.resolves(undefined);
    const buildAndPublishAll = fake.resolves(outcomeWithReport(Result.err({ type: 'config', issues: ['boom'] })));
    const runner = runnerFactory({ buildAndPublishAll, writeReportFile });

    const exitCode = await runner.run(['foo', 'bar', 'publish', '--report-json']);

    assert.strictEqual(exitCode, 1);
    assert.strictEqual(writeReportFile.callCount, 1);
});

test('preview pages previewable output and does not print it directly to stdout', async () => {
    const buildAndPublishAll = fake.resolves(outcomeWithReport(Result.ok([])));
    const pageOutput = fake.resolves(undefined);
    const log = fake();
    const runner = runnerFactory({ buildAndPublishAll, pageOutput, log });

    const exitCode = await runner.run(['foo', 'bar', 'preview']);

    assert.strictEqual(exitCode, 0);
    assert.strictEqual(pageOutput.callCount, 1);
    assert.match(String(pageOutput.firstCall.args[0]), /Packtory preview/);
    assert.strictEqual(log.callCount, 0);
});

test('preview prints failure-only output directly to stdout without paging', async () => {
    const buildAndPublishAll = fake.resolves(outcomeWithReport(Result.err({ type: 'checks', issues: ['boom'] })));
    const pageOutput = fake.resolves(undefined);
    const log = fake();
    const runner = runnerFactory({ buildAndPublishAll, pageOutput, log });

    const exitCode = await runner.run(['foo', 'bar', 'preview']);

    assert.strictEqual(exitCode, 1);
    assert.strictEqual(pageOutput.callCount, 0);
    assert.strictEqual(log.callCount, 1);
    assert.match(String(log.firstCall.args[0]), /Check failures/);
    assert.match(String(log.firstCall.args[0]), /boom/);
});

test('preview --open writes a temporary html report and invokes the opener', async () => {
    const buildAndPublishAll = fake.resolves(outcomeWithReport(Result.ok([])));
    const writeReportFile = fake.resolves(undefined);
    const openFile = fake.resolves(true);
    const runner = runnerFactory({
        buildAndPublishAll,
        writeReportFile,
        openFile,
        createTemporaryFilePath: () => '/tmp/packtory-preview-test.html'
    });

    const exitCode = await runner.run(['foo', 'bar', 'preview', '--open']);

    assert.strictEqual(exitCode, 0);
    assert.strictEqual(writeReportFile.callCount, 1);
    assert.deepStrictEqual(writeReportFile.firstCall.args[0], '/tmp/packtory-preview-test.html');
    assert.match(String(writeReportFile.firstCall.args[1]), /^<!doctype html>/);
    assert.strictEqual(openFile.callCount, 1);
    assert.deepStrictEqual(openFile.firstCall.args, ['/tmp/packtory-preview-test.html']);
});

test('preview --open prints the temp path only when opening fails', async () => {
    const buildAndPublishAll = fake.resolves(outcomeWithReport(Result.ok([])));
    const openFile = fake.resolves(false);
    const log = fake();
    const runner = runnerFactory({
        buildAndPublishAll,
        openFile,
        log,
        createTemporaryFilePath: () => '/tmp/packtory-preview-test.html'
    });

    const exitCode = await runner.run(['foo', 'bar', 'preview', '--open']);

    assert.strictEqual(exitCode, 0);
    assert.strictEqual(log.callCount, 1);
    assert.deepStrictEqual(log.firstCall.args, ['/tmp/packtory-preview-test.html']);
});
