import assert from 'node:assert';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'mocha';
import { createFakeFileManager } from '../test-libraries/fake-file-manager.ts';
import {
    checkMutationTimeoutReport,
    collectTimeoutMutants,
    formatMutationTimeoutError,
    runMutationTimeoutCheck
} from './check-mutation-timeouts.ts';

const checkerScriptPath = fileURLToPath(new URL('./check-mutation-timeouts.entry-point.ts', import.meta.url));
const defaultReportFilePath = 'target/stryker/mutation-report.json';
const defaultMissingReportPath = '/definitely/missing/mutation-report.json';

const killedMutant = { status: 'Killed', location: { start: { line: 1, column: 2 } } };
const timeoutMutant = { status: 'Timeout', location: { start: { line: 7, column: 8 } } };
const malformedTimeoutReport = {
    files: {
        'source/a.ts': null,
        'source/b.ts': { mutants: 'invalid' },
        'source/c.ts': {
            mutants: [
                null,
                { status: 'Timeout', location: null },
                { status: 'Timeout', location: { start: { line: '3', column: 4 } } },
                { status: 'Timeout', location: { start: { line: 3, column: '4' } } },
                { status: 'Timeout', location: { start: { line: 3, column: 4 } } }
            ]
        }
    }
};

function timeoutReportMessage(filePath = 'source/a.ts', line = 7, column = 8): string {
    return ['Mutation report contains 1 timeout mutant.', `- ${filePath}:${line}:${column}`].join('\n');
}

function singleMutantReport(
    mutant: unknown,
    filePath = 'source/a.ts'
): {
    readonly files: Readonly<Record<string, { readonly mutants: readonly unknown[] }>>;
} {
    return {
        files: {
            [filePath]: {
                mutants: [mutant]
            }
        }
    };
}

async function withTemporaryFile<T>(
    relativePath: string,
    contents: string,
    action: (reportPath: string, directory: string) => Promise<T>
): Promise<T> {
    const directory = await mkdtemp(path.join(tmpdir(), 'packtory-mutation-check-'));
    const reportPath = path.join(directory, relativePath);

    try {
        await mkdir(path.dirname(reportPath), { recursive: true });
        await writeFile(reportPath, contents);
        return await action(reportPath, directory);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}

async function withTemporaryReport<T>(
    report: unknown,
    action: (reportPath: string, directory: string) => Promise<T>
): Promise<T> {
    return withTemporaryFile('mutation-report.json', JSON.stringify(report), action);
}

async function withDefaultReport<T>(report: unknown, action: (directory: string) => Promise<T>): Promise<T> {
    return withTemporaryFile(defaultReportFilePath, JSON.stringify(report), async (_reportPath, directory) => {
        return await action(directory);
    });
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

async function expectCheckResult(report: unknown, expected: string | undefined): Promise<void> {
    await withTemporaryReport(report, async (reportPath) => {
        const fileManager = createFakeFileManager({
            simulatedReadFileResponses: [{ value: JSON.stringify(report) }]
        });

        assert.strictEqual(await checkMutationTimeoutReport(reportPath, fileManager), expected);
        assert.deepStrictEqual(fileManager.getReadFileCall(0), { filePath: reportPath });
    });
}

async function expectCheckError(operation: Promise<unknown>, expectedMessage: RegExp | string): Promise<void> {
    try {
        await operation;
        assert.fail('Expected checkMutationTimeoutReport() to throw but it did not');
    } catch (error: unknown) {
        if (typeof expectedMessage === 'string') {
            assert.ok((error as Error).message.includes(expectedMessage));
            return;
        }
        assert.match(String(error), expectedMessage);
    }
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

test('collectTimeoutMutants returns every timeout mutant with its file and location', () => {
    const result = collectTimeoutMutants({
        files: {
            'source/a.ts': {
                mutants: [
                    {
                        status: 'Killed',
                        location: { start: { line: 1, column: 2 } }
                    },
                    {
                        status: 'Timeout',
                        location: { start: { line: 3, column: 4 } }
                    }
                ]
            },
            'source/b.ts': {
                mutants: [
                    {
                        status: 'Timeout',
                        location: { start: { line: 5, column: 6 } }
                    }
                ]
            }
        }
    });

    assert.deepStrictEqual(result, [
        { filePath: 'source/a.ts', line: 3, column: 4 },
        { filePath: 'source/b.ts', line: 5, column: 6 }
    ]);
});

test('collectTimeoutMutants returns an empty array when the report has no files', () => {
    assert.deepStrictEqual(collectTimeoutMutants({}), []);
});

test('formatMutationTimeoutError returns undefined when no timeout mutants exist', () => {
    assert.strictEqual(formatMutationTimeoutError([]), undefined);
});

test('formatMutationTimeoutError formats a summary for timeout mutants', () => {
    assert.strictEqual(
        formatMutationTimeoutError([{ filePath: 'source/a.ts', line: 3, column: 4 }]),
        ['Mutation report contains 1 timeout mutant.', '- source/a.ts:3:4'].join('\n')
    );
});

test('formatMutationTimeoutError pluralizes the summary for multiple timeout mutants', () => {
    assert.strictEqual(
        formatMutationTimeoutError([
            { filePath: 'source/a.ts', line: 3, column: 4 },
            { filePath: 'source/b.ts', line: 5, column: 6 }
        ]),
        ['Mutation report contains 2 timeout mutants.', '- source/a.ts:3:4', '- source/b.ts:5:6'].join('\n')
    );
});

test('checkMutationTimeoutReport returns undefined for a report without timeout mutants', async () => {
    await expectCheckResult(singleMutantReport(killedMutant), undefined);
});

test('checkMutationTimeoutReport returns a failure message for timeout mutants', async () => {
    await expectCheckResult(singleMutantReport(timeoutMutant), timeoutReportMessage());
});

test('checkMutationTimeoutReport ignores malformed file reports and malformed mutants', async () => {
    await withTemporaryReport(
        malformedTimeoutReport,
        async (reportPath) => {
            const fileManager = createFakeFileManager({
                simulatedReadFileResponses: [
                    {
                        value: JSON.stringify(malformedTimeoutReport)
                    }
                ]
            });

            assert.strictEqual(
                await checkMutationTimeoutReport(reportPath, fileManager),
                timeoutReportMessage('source/c.ts', 3, 4)
            );
        }
    );
});

test('checkMutationTimeoutReport throws when a mutant status is not a string', async () => {
    await withTemporaryReport(
        singleMutantReport({ location: { start: { line: 1, column: 2 } } }),
        async (reportPath) => {
            const fileManager = createFakeFileManager({
                simulatedReadFileResponses: [
                    { value: JSON.stringify(singleMutantReport({ location: { start: { line: 1, column: 2 } } })) }
                ]
            });
            await expectCheckError(
                checkMutationTimeoutReport(reportPath, fileManager),
                'Mutation report contains a mutant without a string status'
            );
        }
    );
});

test('checkMutationTimeoutReport returns undefined for malformed top-level report shapes', async () => {
    await withTemporaryReport(null, async (reportPath) => {
        const fileManager = createFakeFileManager({
            simulatedReadFileResponses: [{ value: 'null' }]
        });

        assert.strictEqual(await checkMutationTimeoutReport(reportPath, fileManager), undefined);
    });
});

test('checkMutationTimeoutReport throws a missing-file error with the ENOENT cause preserved', async () => {
    try {
        const fileManager = createFakeFileManager({
            simulatedReadFileResponses: [
                {
                    error: createReadFileError(
                        'ENOENT',
                        `ENOENT: no such file or directory, open '${defaultMissingReportPath}'`
                    )
                }
            ]
        });
        await checkMutationTimeoutReport(defaultMissingReportPath, fileManager);
        assert.fail('Expected checkMutationTimeoutReport() to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, `Mutation report not found at "${defaultMissingReportPath}"`);
        assert.strictEqual((error as Error).cause instanceof Error, true);
        assert.strictEqual(Reflect.get((error as Error).cause as Record<string, unknown>, 'code'), 'ENOENT');
    }
});

test('checkMutationTimeoutReport rethrows invalid JSON parse errors unchanged', async () => {
    await withTemporaryFile('mutation-report.json', '{', async (reportPath) => {
        const fileManager = createFakeFileManager({
            simulatedReadFileResponses: [{ value: '{' }]
        });
        await expectCheckError(checkMutationTimeoutReport(reportPath, fileManager), "Expected property name or '}'");
    });
});

test('runMutationTimeoutCheck writes the failure message and returns exit code 1 when timeouts exist', async () => {
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

test('runMutationTimeoutCheck returns exit code 0 and writes nothing when no timeouts exist', async () => {
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

test('runMutationTimeoutCheck uses the default report path when argv omits an explicit report path', async () => {
    const fileManager = createFakeFileManager({
        simulatedReadFileResponses: [{ value: JSON.stringify(singleMutantReport(killedMutant)) }]
    });
    const result = await runCheckWithCollectedErrors(['node', 'check'], fileManager);

    assert.strictEqual(result.exitCode, 0);
    assert.deepStrictEqual(result.errors, []);
    assert.deepStrictEqual(fileManager.getReadFileCall(0), { filePath: defaultReportFilePath });
});

test('runMutationTimeoutCheck writes missing-file errors and returns exit code 1', async () => {
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

test('runMutationTimeoutCheck uses the default stderr writer when no custom writer is passed', async () => {
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

test('runMutationTimeoutCheck writes invalid JSON errors and returns exit code 1', async () => {
    await withTemporaryFile('mutation-report.json', '{', async (reportPath) => {
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

test('runMutationTimeoutCheck stringifies non-Error failures', async () => {
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

test('CLI uses the default report path and exits with code 0 when there are no timeout mutants', async () => {
    await withDefaultReport(singleMutantReport(killedMutant), async (directory) => {
        const result = await runCheckerCli([], directory);

        assert.strictEqual(result.exitCode, 0);
        assert.strictEqual(result.standardError, '');
    });
});
