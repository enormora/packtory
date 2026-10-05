import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createFakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import { runCanaryCli } from './canary-cli-runner.ts';
import type { CanaryRunResult } from './canary-runner.ts';
import { formatCanarySummary } from './canary-summary.ts';

const reportedIssues: CanaryRunResult = {
    baselineResolvedRef: 'baseline',
    candidateResolvedRef: 'candidate',
    issues: [
        { kind: 'baseline-rot', message: 'baseline import failed' },
        { kind: 'regression', message: 'candidate import failed' },
        { kind: 'warning', message: 'comparison incomplete' }
    ],
    name: 'sample'
};

suite('canary-cli-runner', function () {
    test('runCanaryCli reports all findings without failing a non-blocking canary', async function () {
        const stdout: string[] = [];
        const stderr: string[] = [];
        const fileManager = createFakeFileManager({
            simulatedWriteFileResponses: [ { error: new Error('Unexpected summary write') } ]
        });
        const exitCode = await runCanaryCli([ 'node', 'canaries', '--name', 'sample' ], {
            fileManager,
            async runCanary(manifestPath, name) {
                assert.strictEqual(manifestPath, 'canary-tests/canaries.json');
                assert.strictEqual(name, 'sample');
                return reportedIssues;
            },
            stderrWrite(message) {
                stderr.push(message);
            },
            stdoutWrite(message) {
                stdout.push(message);
            }
        });

        assert.strictEqual(exitCode, 0);
        assert.deepStrictEqual(stderr, []);
        assert.deepStrictEqual(stdout, [
            formatCanarySummary(reportedIssues),
            '::warning::sample: 1. baseline-rot: baseline import failed\n',
            '::warning::sample: 2. regression: candidate import failed\n',
            '::warning::sample: 3. warning: comparison incomplete\n'
        ]);
    });

    test('runCanaryCli writes the summary and uses the selected manifest', async function () {
        const fileManager = createFakeFileManager();
        const result = { ...reportedIssues, issues: [] };
        const stdout: string[] = [];
        const exitCode = await runCanaryCli([
            'node',
            'canaries',
            '--name',
            'sample',
            '--manifest',
            'custom.json',
            '--summary',
            'summary.md'
        ], {
            fileManager,
            async runCanary(manifestPath, name) {
                assert.strictEqual(manifestPath, 'custom.json');
                assert.strictEqual(name, 'sample');
                return result;
            },
            stderrWrite(message) {
                assert.fail(message);
            },
            stdoutWrite(message) {
                stdout.push(message);
            }
        });

        assert.strictEqual(exitCode, 0);
        assert.deepStrictEqual(stdout, [ formatCanarySummary(result) ]);
        assert.deepStrictEqual(fileManager.getWriteFileCall(0), {
            filePath: 'summary.md',
            content: formatCanarySummary(result)
        });
    });

    for (const nameArguments of [ [], [ '--name' ] ]) {
        test(`runCanaryCli rejects a missing name with arguments ${JSON.stringify(nameArguments)}`, async function () {
            const stdout: string[] = [];
            const stderr: string[] = [];
            const exitCode = await runCanaryCli([ 'node', 'canaries', ...nameArguments ], {
                fileManager: createFakeFileManager(),
                async runCanary() {
                    assert.fail('A canary must not run without a name');
                },
                stderrWrite(message) {
                    stderr.push(message);
                },
                stdoutWrite(message) {
                    stdout.push(message);
                }
            });

            assert.strictEqual(exitCode, 1);
            assert.deepStrictEqual(stdout, [ '::warning::Missing required --name argument\n' ]);
            assert.deepStrictEqual(stderr, [ 'Missing required --name argument\n' ]);
        });
    }

    test('runCanaryCli fails on runner errors and escapes annotation controls', async function () {
        const stdout: string[] = [];
        const stderr: string[] = [];
        const message = 'clone failed: 50%\r\n connection lost';
        const exitCode = await runCanaryCli([ 'node', 'canaries', '--name', 'sample' ], {
            fileManager: createFakeFileManager(),
            async runCanary() {
                throw new Error(message);
            },
            stderrWrite(output) {
                stderr.push(output);
            },
            stdoutWrite(output) {
                stdout.push(output);
            }
        });

        assert.strictEqual(exitCode, 1);
        assert.deepStrictEqual(stdout, [ '::warning::clone failed: 50%25%0D%0A connection lost\n' ]);
        assert.deepStrictEqual(stderr, [ `${message}\n` ]);
    });

    test('runCanaryCli fails when the summary cannot be written', async function () {
        const stdout: string[] = [];
        const stderr: string[] = [];
        const exitCode = await runCanaryCli([
            'node',
            'canaries',
            '--name',
            'sample',
            '--summary',
            'summary.md'
        ], {
            fileManager: createFakeFileManager({
                simulatedWriteFileResponses: [ { error: new Error('Summary write failed') } ]
            }),
            async runCanary() {
                return reportedIssues;
            },
            stderrWrite(message) {
                stderr.push(message);
            },
            stdoutWrite(message) {
                stdout.push(message);
            }
        });

        assert.strictEqual(exitCode, 1);
        assert.deepStrictEqual(stdout, [ '::warning::Summary write failed\n' ]);
        assert.deepStrictEqual(stderr, [ 'Summary write failed\n' ]);
    });
});
