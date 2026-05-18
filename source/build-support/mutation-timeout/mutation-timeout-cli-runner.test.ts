import assert from 'node:assert';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { suite, test } from 'mocha';
import { createFakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import {
    killedMutant,
    singleMutantReport,
    timeoutMutant,
    withTemporaryReportDirectory
} from '../../test-libraries/mutation-report-fixtures.ts';
import { runMutationTimeoutCheck } from './mutation-timeout-cli-runner.ts';

const checkerScriptPath = fileURLToPath(new URL('./check-mutation-timeouts.entry-point.ts', import.meta.url));
const defaultReportFilePath = 'target/stryker/mutation-report.json';
const defaultMissingReportPath = '/definitely/missing/mutation-report.json';

function timeoutReportMessage(): string {
    return ['Mutation report contains 1 timeout mutant.', '- source/a.ts:7:8'].join('\n');
}

async function withTemporaryReport<T>(
    report: unknown,
    action: (reportPath: string, directory: string) => Promise<T>
): Promise<T> {
    return withTemporaryReportDirectory('mutation-report.json', JSON.stringify(report), action);
}

async function withDefaultReport<T>(report: unknown, action: (directory: string) => Promise<T>): Promise<T> {
    return withTemporaryReportDirectory(
        defaultReportFilePath,
        JSON.stringify(report),
        async (_reportPath, directory) => {
            return action(directory);
        }
    );
}

async function runCheckerCli(
    args: readonly string[],
    cwd: string
): Promise<{ readonly exitCode: number; readonly standardError: string }> {
    return new Promise((resolve) => {
        execFile(
            process.execPath,
            ['--experimental-strip-types', '--enable-source-maps', checkerScriptPath, ...args],
            { cwd, encoding: 'utf8' },
            (error, _standardOutput, standardError) => {
                resolve({
                    exitCode: typeof error?.code === 'number' ? error.code : 0,
                    standardError
                });
            }
        );
    });
}

function createArgvThrowingNonErrorOnReportPath(): readonly string[] {
    const argv = [] as string[];
    Object.defineProperty(argv, '2', {
        get() {
            // eslint-disable-next-line no-throw-literal, @typescript-eslint/only-throw-error -- this test targets the non-Error catch branch explicitly
            throw 'boom';
        }
    });
    return argv;
}

function createReadFileError(code: string, message: string): Error & { readonly code: string } {
    return Object.assign(new Error(message), { code });
}

async function runCheckWithCollectedErrors(
    argv: readonly string[],
    fileManager = createFakeFileManager({ simulatedReadFileResponses: [{ value: '{}' }] }),
    writeError?: (message: string) => void
): Promise<{ readonly exitCode: number; readonly errors: readonly string[] }> {
    const errors: string[] = [];
    const exitCode = await runMutationTimeoutCheck(argv, {
        fileManager,
        stderrWrite: (message) => {
            errors.push(message);
        },
        writeError: (message) => {
            errors.push(message);
            writeError?.(message);
        }
    });
    return { exitCode, errors };
}

suite('mutation-timeout-cli-runner', function () {
    test('runMutationTimeoutCheck writes the failure message and returns exit code 1 when timeouts exist', async function () {
        await withTemporaryReport(singleMutantReport(timeoutMutant), async (reportPath) => {
            const result = await runCheckWithCollectedErrors(
                ['node', 'check', reportPath],
                createFakeFileManager({
                    simulatedReadFileResponses: [{ value: JSON.stringify(singleMutantReport(timeoutMutant)) }]
                })
            );

            assert.strictEqual(result.exitCode, 1);
            assert.deepStrictEqual(result.errors, [timeoutReportMessage()]);
        });
    });

    test('runMutationTimeoutCheck returns exit code 0 and writes nothing when no timeouts exist', async function () {
        await withTemporaryReport(singleMutantReport(killedMutant), async (reportPath) => {
            const result = await runCheckWithCollectedErrors(
                ['node', 'check', reportPath],
                createFakeFileManager({
                    simulatedReadFileResponses: [{ value: JSON.stringify(singleMutantReport(killedMutant)) }]
                })
            );

            assert.strictEqual(result.exitCode, 0);
            assert.deepStrictEqual(result.errors, []);
        });
    });

    test('runMutationTimeoutCheck uses the default report path when argv omits an explicit report path', async function () {
        const fileManager = createFakeFileManager({
            simulatedReadFileResponses: [{ value: JSON.stringify(singleMutantReport(killedMutant)) }]
        });
        const result = await runCheckWithCollectedErrors(['node', 'check'], fileManager);

        assert.strictEqual(result.exitCode, 0);
        assert.deepStrictEqual(result.errors, []);
        assert.deepStrictEqual(fileManager.getReadFileCall(0), { filePath: defaultReportFilePath });
    });

    test('runMutationTimeoutCheck writes missing-file errors and returns exit code 1', async function () {
        const result = await runCheckWithCollectedErrors(
            ['node', 'check', defaultMissingReportPath],
            createFakeFileManager({
                simulatedReadFileResponses: [
                    {
                        error: createReadFileError(
                            'ENOENT',
                            `ENOENT: no such file or directory, open '${defaultMissingReportPath}'`
                        )
                    }
                ]
            })
        );

        assert.strictEqual(result.exitCode, 1);
        assert.deepStrictEqual(result.errors, [`Mutation report not found at "${defaultMissingReportPath}"`]);
    });

    test('runMutationTimeoutCheck uses the default stderr writer when no custom writer is passed', async function () {
        const writes: string[] = [];
        const exitCode = await runMutationTimeoutCheck(['node', 'check', '/definitely/missing/mutation-report.json'], {
            fileManager: createFakeFileManager({
                simulatedReadFileResponses: [
                    {
                        error: createReadFileError(
                            'ENOENT',
                            "ENOENT: no such file or directory, open '/definitely/missing/mutation-report.json'"
                        )
                    }
                ]
            }),
            stderrWrite: (message) => {
                writes.push(message);
            }
        });

        assert.strictEqual(exitCode, 1);
        assert.deepStrictEqual(writes, ['Mutation report not found at "/definitely/missing/mutation-report.json"\n']);
    });

    test('runMutationTimeoutCheck writes invalid JSON errors and returns exit code 1', async function () {
        await withTemporaryReportDirectory('mutation-report.json', '{', async (reportPath) => {
            const result = await runCheckWithCollectedErrors(
                ['node', 'check', reportPath],
                createFakeFileManager({
                    simulatedReadFileResponses: [{ value: '{' }]
                })
            );

            assert.strictEqual(result.exitCode, 1);
            assert.ok((result.errors[0] ?? '').includes("Expected property name or '}'"));
        });
    });

    test('runMutationTimeoutCheck stringifies non-Error failures', async function () {
        const errors: string[] = [];
        const exitCode = await runMutationTimeoutCheck(createArgvThrowingNonErrorOnReportPath(), {
            fileManager: createFakeFileManager(),
            stderrWrite: () => {
                throw new Error('stderrWrite should not be used when writeError is injected');
            },
            writeError: (message) => {
                errors.push(message);
            }
        });

        assert.strictEqual(exitCode, 1);
        assert.deepStrictEqual(errors, ['boom']);
    });

    test('CLI uses the default report path and exits with code 0 when there are no timeout mutants', async function () {
        await withDefaultReport(singleMutantReport(killedMutant), async (directory) => {
            const result = await runCheckerCli([], directory);

            assert.strictEqual(result.exitCode, 0);
            assert.strictEqual(result.standardError, '');
        });
    });
});
