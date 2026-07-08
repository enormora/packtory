import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Result } from 'true-myth';
import {
    createArtifactEntryFixture,
    createBuildReportFixture,
    createBuildResultFixture,
    createPackageReportFixture
} from '../../test-libraries/preview-fixtures.ts';
import { createFakeFileManager, type FakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import { toOutcome } from '../../test-libraries/result-helpers.ts';
import {
    createRunner,
    expectCollectReportFlag,
    runPreview
} from '../../test-libraries/runner-test-support.ts';

suite('runner report and preview', function () {
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
                                badges: [ 'dead-code-elimination' ]
                            })
                        ]
                    }
                },
                timings: {}
            })
        }
    });

    type OutcomeWithReport = {
        readonly result: unknown;
        readonly getReport: () => typeof sampleReport;
    };
    type OpenPreviewResult = {
        readonly exitCode: number;
        readonly fileManager: FakeFileManager;
        readonly log: SinonSpy;
        readonly openFile: SinonSpy;
    };

    function createOutcomeWithReport(result: unknown): OutcomeWithReport {
        return {
            result,
            getReport() {
                return sampleReport;
            }
        };
    }

    async function runOpenPreview(): Promise<OpenPreviewResult> {
        const buildAndPublishAll = fake.resolves(createOutcomeWithReport(Result.ok([])));
        const fileManager = createFakeFileManager();
        const openFile = fake.resolves(true);
        const log = fake();
        const runner = createRunner({
            buildAndPublishAll,
            fileManager,
            openFile,
            log,
            createTemporaryFilePath() {
                return '/workspace/packtory-preview-test.html';
            }
        });

        const exitCode = await runner.run([ 'foo', 'bar', 'preview', '--open' ]);
        return { exitCode, fileManager, log, openFile };
    }

    suite('publish reports', function () {
        test('publish with --report-json requests collectReport: true', async function () {
            await expectCollectReportFlag('--report-json');
        });

        test('publish with --report-html requests collectReport: true', async function () {
            await expectCollectReportFlag('--report-html');
        });

        async function runPublishWithReport(extraArgs: readonly string[]): Promise<FakeFileManager> {
            const fileManager = createFakeFileManager();
            const buildAndPublishAll = fake.resolves(createOutcomeWithReport(Result.ok([])));
            const runner = createRunner({ buildAndPublishAll, fileManager });
            await runner.run([ 'foo', 'bar', 'publish', ...extraArgs ]);
            return fileManager;
        }

        test('publish writes packtory-report.json when --report-json is set and getReport returns a report', async function () {
            const fileManager = await runPublishWithReport([ '--report-json' ]);

            assert.strictEqual(fileManager.getWriteFileCallCount(), 1);
            assert.strictEqual(fileManager.getWriteFileCall(0).filePath, 'packtory-report.json');
            const writtenContent = fileManager.getWriteFileCall(0).content;
            assert.ok(writtenContent.endsWith('\n'), 'json report must end with a newline');
            assert.deepStrictEqual(JSON.parse(writtenContent), sampleReport);
        });

        test('publish writes packtory-report.html when --report-html is set and getReport returns a report', async function () {
            const fileManager = await runPublishWithReport([ '--report-html' ]);

            assert.strictEqual(fileManager.getWriteFileCallCount(), 1);
            assert.strictEqual(fileManager.getWriteFileCall(0).filePath, 'packtory-report.html');
            const writtenContent = fileManager.getWriteFileCall(0).content;
            assert.ok(writtenContent.startsWith('<!doctype html>'), 'html report must start with doctype');
            assert.ok(writtenContent.includes('Dry run'));
        });

        test('publish writes report html in publish mode when dry-run is disabled', async function () {
            const fileManager = await runPublishWithReport([ '--report-html', '--no-dry-run' ]);

            const writtenContent = fileManager.getWriteFileCall(0).content;
            assert.ok(writtenContent.includes('Publish'));
            assert.ok(!writtenContent.includes('<div class="mode-label">Dry run</div>'));
        });

        test('publish writes both report files when --report-json and --report-html are set', async function () {
            const fileManager = await runPublishWithReport([ '--report-json', '--report-html' ]);

            const writtenPaths = fileManager.getAllWriteFileCalls().map(function (call): unknown {
                return call.filePath;
            });
            assert.deepStrictEqual(writtenPaths, [ 'packtory-report.json', 'packtory-report.html' ]);
        });

        test('publish writes no report files when neither flag is set', async function () {
            const fileManager = await runPublishWithReport([]);

            assert.strictEqual(fileManager.getWriteFileCallCount(), 0);
        });

        test('publish writes no report files when getReport returns undefined even with --report-json set', async function () {
            const fileManager = createFakeFileManager();
            const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
            const runner = createRunner({ buildAndPublishAll, fileManager });

            await runner.run([ 'foo', 'bar', 'publish', '--report-json' ]);

            assert.strictEqual(fileManager.getWriteFileCallCount(), 0);
        });

        test('publish writes the report even when the build failed', async function () {
            const fileManager = createFakeFileManager();
            const buildAndPublishAll = fake.resolves(
                createOutcomeWithReport(Result.err({ type: 'config', issues: [ 'boom' ] }))
            );
            const runner = createRunner({ buildAndPublishAll, fileManager });

            const exitCode = await runner.run([ 'foo', 'bar', 'publish', '--report-json' ]);

            assert.strictEqual(exitCode, 1);
            assert.strictEqual(fileManager.getWriteFileCallCount(), 1);
        });
    });

    suite('preview output', function () {
        test('preview pages previewable output and does not print it directly to stdout', async function () {
            const buildAndPublishAll = fake.resolves(createOutcomeWithReport(Result.ok([])));
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
                    succeeded: [ createBuildResultFixture({ contents: [] }) ],
                    failures: [ new Error('boom') ]
                }),
                getReport() {
                    return report;
                }
            });
            const { exitCode, pageOutput } = await runPreview(buildAndPublishAll);

            assert.strictEqual(exitCode, 1);
            assert.strictEqual(pageOutput.callCount, 1);
        });

        test('preview prints failure-only output directly to stdout without paging', async function () {
            const buildAndPublishAll = fake.resolves(
                createOutcomeWithReport(Result.err({ type: 'checks', issues: [ 'boom' ] }))
            );
            const { exitCode, pageOutput, log } = await runPreview(buildAndPublishAll);

            assert.strictEqual(exitCode, 1);
            assert.strictEqual(pageOutput.callCount, 0);
            assert.strictEqual(log.callCount, 1);
            assert.strictEqual(String(log.firstCall.args[0]), 'Packtory preview [Dry run]\nCheck failures\n- boom');
        });

        test('preview treats partial failures with no successful packages as failure-only output', async function () {
            const buildAndPublishAll = fake.resolves(
                createOutcomeWithReport(Result.err({ type: 'partial', succeeded: [], failures: [ new Error('boom') ] }))
            );
            const { exitCode, pageOutput, log } = await runPreview(buildAndPublishAll);

            assert.strictEqual(exitCode, 1);
            assert.strictEqual(pageOutput.callCount, 0);
            assert.strictEqual(log.callCount, 1);
            assert.strictEqual(String(log.firstCall.args[0]), 'Packtory preview [Dry run]\nPackage failures\n- boom');
        });
    });

    suite('preview open', function () {
        test('preview --open writes a temporary html report and invokes the opener', async function () {
            const { exitCode, fileManager, log, openFile } = await runOpenPreview();

            assert.strictEqual(exitCode, 0);
            assert.strictEqual(fileManager.getWriteFileCallCount(), 1);
            assert.deepStrictEqual(fileManager.getWriteFileCall(0).filePath, '/workspace/packtory-preview-test.html');
            assert.match(fileManager.getWriteFileCall(0).content, /^<!doctype html>/);
            assert.partialDeepStrictEqual(openFile, {
                callCount: 1,
                firstCall: {
                    args: [ '/workspace/packtory-preview-test.html' ]
                }
            });
            assert.strictEqual(log.callCount, 0);
        });

        test('preview --open prints the temp path only when opening fails', async function () {
            const buildAndPublishAll = fake.resolves(createOutcomeWithReport(Result.ok([])));
            const openFile = fake.resolves(false);
            const log = fake();
            const runner = createRunner({
                buildAndPublishAll,
                openFile,
                log,
                createTemporaryFilePath() {
                    return '/workspace/packtory-preview-test.html';
                }
            });

            const exitCode = await runner.run([ 'foo', 'bar', 'preview', '--open' ]);

            assert.strictEqual(exitCode, 0);
            assert.partialDeepStrictEqual(log, {
                callCount: 1,
                firstCall: {
                    args: [ '/workspace/packtory-preview-test.html' ]
                }
            });
        });

        test('preview builds an empty fallback report when getReport returns undefined', async function () {
            const buildAndPublishAll = fake.resolves(toOutcome(Result.err({ type: 'checks', issues: [ 'boom' ] })));
            const log = fake();
            const runner = createRunner({ buildAndPublishAll, log });

            await runner.run([ 'foo', 'bar', 'preview' ]);

            assert.strictEqual(String(log.firstCall.args[0]), 'Packtory preview [Dry run]\nCheck failures\n- boom');
        });

        test('preview --open writes an empty fallback report when getReport returns undefined', async function () {
            const fileManager = createFakeFileManager();
            const buildAndPublishAll = fake.resolves(toOutcome(Result.err({ type: 'checks', issues: [ 'boom' ] })));
            const runner = createRunner({
                buildAndPublishAll,
                fileManager,
                createTemporaryFilePath() {
                    return '/workspace/packtory-preview-fallback.html';
                }
            });

            const exitCode = await runner.run([ 'foo', 'bar', 'preview', '--open' ]);

            assert.strictEqual(exitCode, 1);
            assert.strictEqual(fileManager.getWriteFileCallCount(), 1);
            assert.strictEqual(fileManager.getWriteFileCall(0).filePath, '/workspace/packtory-preview-fallback.html');
            assert.match(
                fileManager.getWriteFileCall(0).content,
                /&quot;aggregate&quot;: \{\s+&quot;crossBundleLinks&quot;: \[\]/u
            );
        });

        test('preview stops all spinners when config loading fails before the build starts', async function () {
            const stopAll = fake();
            const loadConfig = fake.rejects(new Error('config boom'));
            const runner = createRunner({ loadConfig, spinnerRenderer: { stopAll } });

            try {
                await runner.run([ 'foo', 'bar', 'preview' ]);
                assert.fail('expected preview run to throw');
            } catch (error: unknown) {
                assert.strictEqual((error as Error).message, 'config boom');
            }

            assert.strictEqual(stopAll.callCount, 1);
        });
    });
});
