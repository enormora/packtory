import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createFakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import { runCanaryCommandLineInterface } from './canary-command-line-interface.ts';
import type { CanaryRunResult } from './canary-runner.ts';
import { formatCanarySummary } from './canary-summary.ts';

const reportedIssues: CanaryRunResult = {
    baselineResolvedReference: 'baseline',
    candidateResolvedReference: 'candidate',
    issues: [
        { kind: 'baseline-rot', message: 'baseline import failed' },
        { kind: 'regression', message: 'candidate import failed' },
        { kind: 'warning', message: 'comparison incomplete' }
    ],
    name: 'sample'
};

suite('canary-command-line-interface', function () {
    test('runCanaryCommandLineInterface reports all findings without failing a non-blocking canary', async function () {
        const standardOutput: string[] = [];
        const standardError: string[] = [];
        const fileManager = createFakeFileManager({
            simulatedWriteFileResponses: [ { error: new Error('Unexpected summary write') } ]
        });
        const exitCode = await runCanaryCommandLineInterface([ 'node', 'canaries', '--name', 'sample' ], {
            fileManager,
            async runCanary(manifestPath, name) {
                assert.strictEqual(manifestPath, 'canary-tests/canaries.json');
                assert.strictEqual(name, 'sample');
                return reportedIssues;
            },
            standardErrorWrite(message) {
                standardError.push(message);
            },
            standardOutputWrite(message) {
                standardOutput.push(message);
            }
        });

        assert.strictEqual(exitCode, 0);
        assert.deepStrictEqual(standardError, []);
        assert.deepStrictEqual(standardOutput, [
            formatCanarySummary(reportedIssues),
            '::warning::sample: 1. baseline-rot: baseline import failed\n',
            '::warning::sample: 2. regression: candidate import failed\n',
            '::warning::sample: 3. warning: comparison incomplete\n'
        ]);
    });

    test('runCanaryCommandLineInterface writes the summary and uses the selected manifest', async function () {
        const fileManager = createFakeFileManager();
        const result = { ...reportedIssues, issues: [] };
        const standardOutput: string[] = [];
        const exitCode = await runCanaryCommandLineInterface([
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
            standardErrorWrite(message) {
                assert.fail(message);
            },
            standardOutputWrite(message) {
                standardOutput.push(message);
            }
        });

        assert.strictEqual(exitCode, 0);
        assert.deepStrictEqual(standardOutput, [ formatCanarySummary(result) ]);
        assert.deepStrictEqual(fileManager.getWriteFileCall(0), {
            filePath: 'summary.md',
            content: formatCanarySummary(result)
        });
    });

    for (const nameArguments of [ [], [ '--name' ] ]) {
        test(`rejects a missing canary name with arguments ${JSON.stringify(nameArguments)}`, async function () {
            const standardOutput: string[] = [];
            const standardError: string[] = [];
            const exitCode = await runCanaryCommandLineInterface([ 'node', 'canaries', ...nameArguments ], {
                fileManager: createFakeFileManager(),
                async runCanary() {
                    assert.fail('A canary must not run without a name');
                },
                standardErrorWrite(message) {
                    standardError.push(message);
                },
                standardOutputWrite(message) {
                    standardOutput.push(message);
                }
            });

            assert.strictEqual(exitCode, 1);
            assert.deepStrictEqual(standardOutput, [ '::warning::Missing required --name argument\n' ]);
            assert.deepStrictEqual(standardError, [ 'Missing required --name argument\n' ]);
        });
    }

    test('runCanaryCommandLineInterface fails on runner errors and escapes annotation controls', async function () {
        const standardOutput: string[] = [];
        const standardError: string[] = [];
        const message = 'clone failed: 50%\r\n connection lost';
        const exitCode = await runCanaryCommandLineInterface([ 'node', 'canaries', '--name', 'sample' ], {
            fileManager: createFakeFileManager(),
            async runCanary() {
                throw new Error(message);
            },
            standardErrorWrite(output) {
                standardError.push(output);
            },
            standardOutputWrite(output) {
                standardOutput.push(output);
            }
        });

        assert.strictEqual(exitCode, 1);
        assert.deepStrictEqual(standardOutput, [ '::warning::clone failed: 50%25%0D%0A connection lost\n' ]);
        assert.deepStrictEqual(standardError, [ `${message}\n` ]);
    });

    test('runCanaryCommandLineInterface fails when the summary cannot be written', async function () {
        const standardOutput: string[] = [];
        const standardError: string[] = [];
        const exitCode = await runCanaryCommandLineInterface([
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
            standardErrorWrite(message) {
                standardError.push(message);
            },
            standardOutputWrite(message) {
                standardOutput.push(message);
            }
        });

        assert.strictEqual(exitCode, 1);
        assert.deepStrictEqual(standardOutput, [ '::warning::Summary write failed\n' ]);
        assert.deepStrictEqual(standardError, [ 'Summary write failed\n' ]);
    });
});
