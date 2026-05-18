/* eslint-disable sonarjs/publicly-writable-directories -- temp preview paths are intentional test fixtures */
import assert from 'node:assert';
import { stripVTControlCharacters } from 'node:util';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Result } from 'true-myth';
import { createProgressBroadcaster, type ProgressBroadcaster } from '../../progress/progress-broadcaster.ts';
import {
    createArtifactEntryFixture,
    createBuildReportFixture,
    createBuildResultFixture,
    createPackageReportFixture
} from '../../test-libraries/preview-fixtures.ts';
import { createFakeFileManager, type FakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import { toOutcome } from '../../test-libraries/result-helpers.ts';
import {
    createCommandLineInterfaceRunner,
    type CommandLineInterfaceRunner,
    type CommandLineInterfaceRunnerDependencies
} from './runner.ts';

type Overrides = {
    readonly buildAndPublishAll?: SinonSpy;
    readonly loadConfig?: SinonSpy;
    readonly log?: SinonSpy;
    readonly fileManager?: FakeFileManager;
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
    const fileManager = overrides.fileManager ?? createFakeFileManager();
    const dependencies: CommandLineInterfaceRunnerDependencies = {
        packtory: {
            buildAndPublishAll: createSpy(overrides.buildAndPublishAll, () => {
                return fake.resolves(undefined);
            }),
            diffAgainstLatestPublished: fake.resolves(toOutcome(Result.ok([]))),
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
        fileManager,
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

async function expectCommandLoadsConfig(command: 'preview' | 'publish'): Promise<void> {
    const loadConfig = fake.resolves('the-config');
    const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
    const runner = runnerFactory({ loadConfig, buildAndPublishAll });

    await runner.run(['foo', 'bar', command]);

    assert.strictEqual(loadConfig.callCount, 1);
    assert.strictEqual(buildAndPublishAll.callCount, 1);
    assert.strictEqual(buildAndPublishAll.firstCall.args[0], 'the-config');
}

async function expectHelp(args: readonly string[]): Promise<string> {
    const log = fake();
    const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
    const runner = runnerFactory({ buildAndPublishAll, log });

    const exitCode = await runner.run(['foo', 'bar', ...args]);

    assert.strictEqual(exitCode, 0);
    return String(log.firstCall.args[0]);
}

async function expectSubcommandHelp(command: 'preview' | 'publish'): Promise<string> {
    return expectHelp([command, '--help']);
}

async function expectCollectReportFlag(flag: '--report-html' | '--report-json'): Promise<void> {
    const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
    const runner = runnerFactory({ buildAndPublishAll });

    await runner.run(['foo', 'bar', 'publish', flag]);

    assert.deepStrictEqual(buildAndPublishAll.firstCall.args[1], { dryRun: true, collectReport: true });
}

async function runPreview(
    buildAndPublishAll: SinonSpy,
    overrides: { readonly pageOutput?: SinonSpy; readonly log?: SinonSpy } = {}
): Promise<{ readonly exitCode: number; readonly pageOutput: SinonSpy; readonly log: SinonSpy }> {
    const pageOutput = overrides.pageOutput ?? fake.resolves(undefined);
    const log = overrides.log ?? fake();
    const runner = runnerFactory({ buildAndPublishAll, pageOutput, log });

    const exitCode = await runner.run(['foo', 'bar', 'preview']);

    return { exitCode, pageOutput, log };
}

suite('runner', function () {
    test('publish command loads the config file and passes it to buildAndPublishAll()', async function () {
        await expectCommandLoadsConfig('publish');
    });

    test('publish command runs in dry-run mode per default', async function () {
        const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
        const runner = runnerFactory({ buildAndPublishAll });

        await runner.run(['foo', 'bar', 'publish']);

        assert.strictEqual(buildAndPublishAll.callCount, 1);
        assert.deepStrictEqual(buildAndPublishAll.firstCall.args[1], { dryRun: true, collectReport: false });
    });

    test('publish command runs not in dry-run mode when no-dry-run flag is set', async function () {
        const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
        const runner = runnerFactory({ buildAndPublishAll });

        await runner.run(['foo', 'bar', 'publish', '--no-dry-run']);

        assert.strictEqual(buildAndPublishAll.callCount, 1);
        assert.deepStrictEqual(buildAndPublishAll.firstCall.args[1], { dryRun: false, collectReport: false });
    });

    test('preview command loads the config file and passes it to buildAndPublishAll()', async function () {
        await expectCommandLoadsConfig('preview');
    });

    test('preview command always runs in dry-run mode with collectReport enabled', async function () {
        const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
        const runner = runnerFactory({ buildAndPublishAll });

        await runner.run(['foo', 'bar', 'preview']);

        assert.deepStrictEqual(buildAndPublishAll.firstCall.args[1], { dryRun: true, collectReport: true });
    });

    test('returns exit code 0 when publish command had no errors', async function () {
        const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
        const runner = runnerFactory({ buildAndPublishAll });

        const exitCode = await runner.run(['foo', 'bar', 'publish']);

        assert.strictEqual(exitCode, 0);
    });

    test('returns exit code 1 when publish command has errors', async function () {
        const buildAndPublishAll = fake.resolves(toOutcome(Result.err({ type: 'config', issues: [] })));
        const runner = runnerFactory({ buildAndPublishAll });

        const exitCode = await runner.run(['foo', 'bar', 'publish']);

        assert.strictEqual(exitCode, 1);
    });

    test('returns exit code 1 instead of exiting the process when command parsing fails', async function () {
        const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
        const log = fake();
        const runner = runnerFactory({ buildAndPublishAll, log });

        const exitCode = await runner.run(['foo', 'bar', 'not-a-command']);

        assert.strictEqual(exitCode, 1);
        assert.strictEqual(buildAndPublishAll.callCount, 0);
        assert.strictEqual(log.callCount, 1);
        assert.match(String(log.firstCall.args[0]), /packtory --help/);
    });

    test('returns exit code 1 when the publish command name is misspelled', async function () {
        const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
        const runner = runnerFactory({ buildAndPublishAll });

        const exitCode = await runner.run(['foo', 'bar', 'publis']);

        assert.strictEqual(exitCode, 1);
        assert.strictEqual(buildAndPublishAll.callCount, 0);
    });

    test('prints command help that includes the publish command name and description', async function () {
        const help = await expectHelp(['--help']);

        assert.ok(help.includes('publish'), 'Expected help output to include the publish command name');
        assert.ok(
            help.includes('Builds and publishes all packages (dry-run enabled by default).'),
            'Expected help output to include the publish command description'
        );
        assert.ok(help.includes('preview'), 'Expected help output to include the preview command');
    });

    test('prints subcommand help that includes the full publish command path', async function () {
        assert.match(await expectSubcommandHelp('publish'), /packtory publish/);
    });

    test('prints subcommand help that includes the full preview command path and --open flag', async function () {
        const help = await expectSubcommandHelp('preview');

        assert.match(help, /packtory preview/);
        assert.match(help, /--open/);
        assert.match(help, /Builds all packages in fresh dry-run mode and opens a human preview\./);
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

    test('rethrows the error when buildAndPublishAll() throws', async function () {
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

    test('prints error summary when publish command encounters config errors', async function () {
        const { log } = await runWithIssues('config', ['foo']);
        assert.strictEqual(log.callCount, 2);
        assert.deepStrictEqual(log.firstCall.args, ['✖ The provided config is invalid, there are 1 issue(s)\n\n- foo']);
    });

    test('prints every config issue on its own bullet line', async function () {
        const { log } = await runWithIssues('config', ['foo', 'bar']);
        assert.deepStrictEqual(log.firstCall.args, [
            '✖ The provided config is invalid, there are 2 issue(s)\n\n- foo\n- bar'
        ]);
    });

    test('prints error summary when publish command encounters check errors', async function () {
        const { log } = await runWithIssues('checks', ['foo']);
        assert.strictEqual(log.callCount, 2);
        assert.deepStrictEqual(log.firstCall.args, ['✖ Checks failed, there are 1 issue(s)\n\n- foo']);
    });

    test('prints every check issue on its own bullet line', async function () {
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

    test('prints error summary and dry-run note when publish command encounters partial errors', async function () {
        const log = await runPublishCapturingLog(fake.resolves(partialResultWithTwoFailures));

        assert.strictEqual(log.callCount, 2);
        assert.deepStrictEqual(log.firstCall.args, ['✖ 2 from 3 package(s) failed; 1 succeeded\n- first\n- second']);
        assert.deepStrictEqual(log.secondCall.args, [dryRunNote]);
    });

    test('prints error summary without dry-run note when publish command encounters partial errors and dry-run mode is disabled', async function () {
        const log = await runPublishCapturingLog(fake.resolves(partialResultWithTwoFailures), ['--no-dry-run']);

        assert.strictEqual(log.callCount, 1);
        assert.deepStrictEqual(log.firstCall.args, ['✖ 2 from 3 package(s) failed; 1 succeeded\n- first\n- second']);
    });

    test('prints success summary and dry-run note when publish command had no errors', async function () {
        const log = await runPublishCapturingLog(fake.resolves(toOutcome(Result.ok(['foo', 'bar']))));

        assert.strictEqual(log.callCount, 2);
        assert.deepStrictEqual(log.firstCall.args, ['✔ Success: all 2 package(s) have been published']);
        assert.deepStrictEqual(log.secondCall.args, [dryRunNote]);
    });

    test('prints success summary without dry-run note when publish command had no errors and dry-run mode is disabled', async function () {
        const log = await runPublishCapturingLog(fake.resolves(toOutcome(Result.ok(['foo', 'bar']))), ['--no-dry-run']);

        assert.strictEqual(log.callCount, 1);
        assert.deepStrictEqual(log.firstCall.args, ['✔ Success: all 2 package(s) have been published']);
    });

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
        const runner = runnerFactory({ buildAndPublishAll, spinnerRenderer: { stopAll } });

        await runner.run(['foo', 'bar', 'publish']);
        assert.strictEqual(stopAll.callCount, 1);
    });

    test('adds a spinner when progressBroadcaster receives a "scheduled" event', async function () {
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

    test('stops a running spinner with failure status when progressBroadcaster receives an "error" event', async function () {
        const stop = fake();
        await runWithProgressEvent({ stop }, 'error', { packageName: 'foo', error: new Error('bar') });

        assert.strictEqual(stop.callCount, 1);
        assert.deepStrictEqual(stop.firstCall.args, ['foo', 'failure', 'bar']);
    });

    test('stops a running spinner with success status when progressBroadcaster receives an "done" event and already-published status', async function () {
        const stop = fake();
        await runWithProgressEvent({ stop }, 'done', { packageName: 'foo', version: '1', status: 'already-published' });

        assert.strictEqual(stop.callCount, 1);
        assert.deepStrictEqual(stop.firstCall.args, [
            'foo',
            'success',
            'Nothing has changed, published version 1 is already up-to-date'
        ]);
    });

    test('stops a running spinner with success status when progressBroadcaster receives an "done" event and initial-version status', async function () {
        const stop = fake();
        await runWithProgressEvent({ stop }, 'done', { packageName: 'foo', version: '1', status: 'initial-version' });

        assert.strictEqual(stop.callCount, 1);
        assert.deepStrictEqual(stop.firstCall.args, ['foo', 'success', 'First version 1 has been published']);
    });

    test('stops a running spinner with success status when progressBroadcaster receives an "done" event and new-version status', async function () {
        const stop = fake();
        await runWithProgressEvent({ stop }, 'done', { packageName: 'foo', version: '1', status: 'new-version' });

        assert.strictEqual(stop.callCount, 1);
        assert.deepStrictEqual(stop.firstCall.args, ['foo', 'success', 'New version 1 published']);
    });

    test('updates a running spinner message when a "building" event is received', async function () {
        const updateMessage = fake();
        await runWithProgressEvent({ updateMessage }, 'building', { packageName: 'foo', version: '1' });

        assert.strictEqual(updateMessage.callCount, 1);
        assert.deepStrictEqual(updateMessage.firstCall.args, ['foo', 'Building package with version 1']);
    });

    test('updates a running spinner message when a "rebuilding" event is received', async function () {
        const updateMessage = fake();
        await runWithProgressEvent({ updateMessage }, 'rebuilding', { packageName: 'foo', version: '1' });

        assert.strictEqual(updateMessage.callCount, 1);
        assert.deepStrictEqual(updateMessage.firstCall.args, ['foo', 'Rebuilding package with version 1']);
    });

    const sampleReport = createBuildReportFixture({
        packages: {
            'pkg-a': createPackageReportFixture({
                outputs: {
                    tarball: {
                        totalBytes: 20,
                        entries: [
                            createArtifactEntryFixture({ kind: 'manifest', path: 'package.json', badges: [] }),
                            createArtifactEntryFixture({
                                path: 'index.js',
                                sizeBytes: 18,
                                sourcePath: '/workspace/index.js',
                                badges: ['dead-code-elimination']
                            })
                        ]
                    }
                },
                timings: {}
            })
        }
    });

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

    test('publish with --report-json requests collectReport: true', async function () {
        await expectCollectReportFlag('--report-json');
    });

    test('publish with --report-html requests collectReport: true', async function () {
        await expectCollectReportFlag('--report-html');
    });

    async function runPublishWithReport(extraArgs: readonly string[]): Promise<FakeFileManager> {
        const fileManager = createFakeFileManager();
        const buildAndPublishAll = fake.resolves(outcomeWithReport(Result.ok([])));
        const runner = runnerFactory({ buildAndPublishAll, fileManager });
        await runner.run(['foo', 'bar', 'publish', ...extraArgs]);
        return fileManager;
    }

    test('publish writes packtory-report.json when --report-json is set and getReport returns a report', async function () {
        const fileManager = await runPublishWithReport(['--report-json']);

        assert.strictEqual(fileManager.getWriteFileCallCount(), 1);
        assert.strictEqual(fileManager.getWriteFileCall(0).filePath, 'packtory-report.json');
        const writtenContent = fileManager.getWriteFileCall(0).content;
        assert.ok(writtenContent.endsWith('\n'), 'json report must end with a newline');
        assert.deepStrictEqual(JSON.parse(writtenContent), sampleReport);
    });

    test('publish writes packtory-report.html when --report-html is set and getReport returns a report', async function () {
        const fileManager = await runPublishWithReport(['--report-html']);

        assert.strictEqual(fileManager.getWriteFileCallCount(), 1);
        assert.strictEqual(fileManager.getWriteFileCall(0).filePath, 'packtory-report.html');
        const writtenContent = fileManager.getWriteFileCall(0).content;
        assert.ok(writtenContent.startsWith('<!doctype html>'), 'html report must start with doctype');
        assert.ok(writtenContent.includes('Dry run'));
    });

    test('publish writes report html in publish mode when dry-run is disabled', async function () {
        const fileManager = await runPublishWithReport(['--report-html', '--no-dry-run']);

        const writtenContent = fileManager.getWriteFileCall(0).content;
        assert.ok(writtenContent.includes('Publish'));
        assert.ok(!writtenContent.includes('<div class="mode-label">Dry run</div>'));
    });

    test('publish writes both report files when --report-json and --report-html are set', async function () {
        const fileManager = await runPublishWithReport(['--report-json', '--report-html']);

        const writtenPaths = fileManager.getAllWriteFileCalls().map((call): unknown => {
            return call.filePath;
        });
        assert.deepStrictEqual(writtenPaths, ['packtory-report.json', 'packtory-report.html']);
    });

    test('publish writes no report files when neither flag is set', async function () {
        const fileManager = await runPublishWithReport([]);

        assert.strictEqual(fileManager.getWriteFileCallCount(), 0);
    });

    test('publish writes no report files when getReport returns undefined even with --report-json set', async function () {
        const fileManager = createFakeFileManager();
        const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
        const runner = runnerFactory({ buildAndPublishAll, fileManager });

        await runner.run(['foo', 'bar', 'publish', '--report-json']);

        assert.strictEqual(fileManager.getWriteFileCallCount(), 0);
    });

    test('publish writes the report even when the build failed', async function () {
        const fileManager = createFakeFileManager();
        const buildAndPublishAll = fake.resolves(outcomeWithReport(Result.err({ type: 'config', issues: ['boom'] })));
        const runner = runnerFactory({ buildAndPublishAll, fileManager });

        const exitCode = await runner.run(['foo', 'bar', 'publish', '--report-json']);

        assert.strictEqual(exitCode, 1);
        assert.strictEqual(fileManager.getWriteFileCallCount(), 1);
    });

    test('preview pages previewable output and does not print it directly to stdout', async function () {
        const buildAndPublishAll = fake.resolves(outcomeWithReport(Result.ok([])));
        const { exitCode, pageOutput, log } = await runPreview(buildAndPublishAll);

        assert.strictEqual(exitCode, 0);
        assert.strictEqual(pageOutput.callCount, 1);
        assert.match(String(pageOutput.firstCall.args[0]), /Packtory preview/);
        assert.match(String(pageOutput.firstCall.args[0]), /\[Dry run]/);
        assert.strictEqual(log.callCount, 0);
    });

    test('preview pages partial-success output and still exits with code 1', async function () {
        const report = {
            ...sampleReport,
            packages: {
                'pkg-a': {
                    ...sampleReport.packages['pkg-a'],
                    outputs: {
                        tarball: {
                            totalBytes: 20,
                            entries: [
                                createArtifactEntryFixture({ kind: 'manifest', path: 'package.json', badges: [] }),
                                createArtifactEntryFixture({
                                    path: 'index.js',
                                    sizeBytes: 18,
                                    sourcePath: '/workspace/index.js',
                                    status: 'unchanged',
                                    badges: []
                                })
                            ]
                        }
                    }
                }
            }
        };
        const buildAndPublishAll = fake.resolves({
            result: Result.err({
                type: 'partial' as const,
                succeeded: [createBuildResultFixture({ contents: [] })],
                failures: [new Error('boom')]
            }),
            getReport: () => report
        });
        const { exitCode, pageOutput } = await runPreview(buildAndPublishAll);

        assert.strictEqual(exitCode, 1);
        assert.strictEqual(pageOutput.callCount, 1);
    });

    test('preview prints failure-only output directly to stdout without paging', async function () {
        const buildAndPublishAll = fake.resolves(outcomeWithReport(Result.err({ type: 'checks', issues: ['boom'] })));
        const { exitCode, pageOutput, log } = await runPreview(buildAndPublishAll);

        assert.strictEqual(exitCode, 1);
        assert.strictEqual(pageOutput.callCount, 0);
        assert.strictEqual(log.callCount, 1);
        assert.strictEqual(String(log.firstCall.args[0]), 'Packtory preview [Dry run]\nCheck failures\n- boom');
    });

    test('preview treats partial failures with no successful packages as failure-only output', async function () {
        const buildAndPublishAll = fake.resolves(
            outcomeWithReport(Result.err({ type: 'partial', succeeded: [], failures: [new Error('boom')] }))
        );
        const { exitCode, pageOutput, log } = await runPreview(buildAndPublishAll);

        assert.strictEqual(exitCode, 1);
        assert.strictEqual(pageOutput.callCount, 0);
        assert.strictEqual(log.callCount, 1);
        assert.strictEqual(String(log.firstCall.args[0]), 'Packtory preview [Dry run]\nPackage failures\n- boom');
    });

    test('preview --open writes a temporary html report and invokes the opener', async function () {
        const buildAndPublishAll = fake.resolves(outcomeWithReport(Result.ok([])));
        const fileManager = createFakeFileManager();
        const openFile = fake.resolves(true);
        const log = fake();
        const runner = runnerFactory({
            buildAndPublishAll,
            fileManager,
            openFile,
            log,
            createTemporaryFilePath: () => '/tmp/packtory-preview-test.html'
        });

        const exitCode = await runner.run(['foo', 'bar', 'preview', '--open']);

        assert.strictEqual(exitCode, 0);
        assert.strictEqual(fileManager.getWriteFileCallCount(), 1);
        assert.deepStrictEqual(fileManager.getWriteFileCall(0).filePath, '/tmp/packtory-preview-test.html');
        assert.match(fileManager.getWriteFileCall(0).content, /^<!doctype html>/);
        assert.strictEqual(openFile.callCount, 1);
        assert.deepStrictEqual(openFile.firstCall.args, ['/tmp/packtory-preview-test.html']);
        assert.strictEqual(log.callCount, 0);
    });

    test('preview --open prints the temp path only when opening fails', async function () {
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

    test('preview builds an empty fallback report when getReport returns undefined', async function () {
        const buildAndPublishAll = fake.resolves(toOutcome(Result.err({ type: 'checks', issues: ['boom'] })));
        const log = fake();
        const runner = runnerFactory({ buildAndPublishAll, log });

        await runner.run(['foo', 'bar', 'preview']);

        assert.strictEqual(String(log.firstCall.args[0]), 'Packtory preview [Dry run]\nCheck failures\n- boom');
    });

    test('preview --open writes an empty fallback report when getReport returns undefined', async function () {
        const fileManager = createFakeFileManager();
        const buildAndPublishAll = fake.resolves(toOutcome(Result.err({ type: 'checks', issues: ['boom'] })));
        const runner = runnerFactory({
            buildAndPublishAll,
            fileManager,
            createTemporaryFilePath: () => '/tmp/packtory-preview-fallback.html'
        });

        const exitCode = await runner.run(['foo', 'bar', 'preview', '--open']);

        assert.strictEqual(exitCode, 1);
        assert.strictEqual(fileManager.getWriteFileCallCount(), 1);
        assert.strictEqual(fileManager.getWriteFileCall(0).filePath, '/tmp/packtory-preview-fallback.html');
        assert.match(
            fileManager.getWriteFileCall(0).content,
            /&quot;aggregate&quot;: \{\s+&quot;crossBundleLinks&quot;: \[\]/u
        );
    });

    test('preview stops all spinners when config loading fails before the build starts', async function () {
        const stopAll = fake();
        const loadConfig = fake.rejects(new Error('config boom'));
        const runner = runnerFactory({ loadConfig, spinnerRenderer: { stopAll } });

        try {
            await runner.run(['foo', 'bar', 'preview']);
            assert.fail('expected preview run to throw');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'config boom');
        }

        assert.strictEqual(stopAll.callCount, 1);
    });
});
