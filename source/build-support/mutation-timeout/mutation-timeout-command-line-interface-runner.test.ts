import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createFakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import { killedMutant, singleMutantReport, timeoutMutant } from '../../test-libraries/mutation-report-fixtures.ts';
import { throwNonError } from '../../test-libraries/non-error-failures.ts';
import { runMutationTimeoutCheck } from './mutation-timeout-command-line-interface-runner.ts';

const defaultReportFilePath = 'target/stryker/mutation-report.json';
const defaultMissingReportPath = '/definitely/missing/mutation-report.json';
function timeoutReportMessage(): string {
    return [ 'Mutation report contains 1 timeout mutant.', '- source/a.ts:7:8' ].join('\n');
}
function createArgumentValuesThrowingNonErrorOnReportPath(): readonly string[] {
    const argumentValues = [] as string[];
    Object.defineProperty(argumentValues, '2', {
        get() {
            return throwNonError('boom');
        }
    });
    return argumentValues;
}
function createReadFileError(message: string): Error & {
    readonly code: string;
} {
    return Object.assign(new Error(message), {
        code: 'ENOENT'
    });
}
async function runCheckWithCollectedErrors(
    argumentValues: readonly string[],
    fileManager = createFakeFileManager({
        simulatedReadFileResponses: [ {
            value: '{}'
        } ]
    })
): Promise<{
    readonly exitCode: number;
    readonly errors: readonly string[];
}> {
    const errors: string[] = [];
    const exitCode = await runMutationTimeoutCheck(argumentValues, {
        fileManager,
        standardErrorWrite(message) {
            errors.push(message);
        },
        writeError(message) {
            errors.push(message);
        }
    });
    return {
        exitCode,
        errors
    };
}

suite('mutation-timeout-cli-runner', function () {
    test('runMutationTimeoutCheck writes the failure message and returns exit code 1 when timeouts exist', async function () {
        const reportPath = 'mutation-report.json';
        const result = await runCheckWithCollectedErrors(
            [ 'node', 'check', reportPath ],
            createFakeFileManager({
                simulatedReadFileResponses: [ {
                    value: JSON.stringify(singleMutantReport(timeoutMutant))
                } ]
            })
        );
        assert.partialDeepStrictEqual(result, {
            exitCode: 1,
            errors: [ timeoutReportMessage() ]
        });
    });

    test('runMutationTimeoutCheck returns exit code 0 and writes nothing when no timeouts exist', async function () {
        const reportPath = 'mutation-report.json';
        const result = await runCheckWithCollectedErrors(
            [ 'node', 'check', reportPath ],
            createFakeFileManager({
                simulatedReadFileResponses: [ {
                    value: JSON.stringify(singleMutantReport(killedMutant))
                } ]
            })
        );
        assert.partialDeepStrictEqual(result, {
            exitCode: 0,
            errors: []
        });
    });

    test('runMutationTimeoutCheck uses the default report path when argv omits an explicit report path', async function () {
        const fileManager = createFakeFileManager({
            simulatedReadFileResponses: [ {
                value: JSON.stringify(singleMutantReport(killedMutant))
            } ]
        });
        const result = await runCheckWithCollectedErrors([ 'node', 'check' ], fileManager);
        assert.partialDeepStrictEqual(result, {
            exitCode: 0,
            errors: []
        });
        assert.deepStrictEqual(fileManager.getReadFileCall(0), {
            filePath: defaultReportFilePath
        });
    });

    test('runMutationTimeoutCheck writes missing-file errors and returns exit code 1', async function () {
        const result = await runCheckWithCollectedErrors(
            [ 'node', 'check', defaultMissingReportPath ],
            createFakeFileManager({
                simulatedReadFileResponses: [ {
                    error: createReadFileError(`ENOENT: no such file or directory, open '${defaultMissingReportPath}'`)
                } ]
            })
        );
        assert.partialDeepStrictEqual(result, {
            exitCode: 1,
            errors: [ `Mutation report not found at "${defaultMissingReportPath}"` ]
        });
    });

    test('runMutationTimeoutCheck uses the default stderr writer when no custom writer is passed', async function () {
        const writes: string[] = [];
        const exitCode = await runMutationTimeoutCheck(
            [ 'node', 'check', '/definitely/missing/mutation-report.json' ],
            {
                fileManager: createFakeFileManager({
                    simulatedReadFileResponses: [ {
                        error: createReadFileError(
                            "ENOENT: no such file or directory, open '/definitely/missing/mutation-report.json'"
                        )
                    } ]
                }),
                standardErrorWrite(message) {
                    writes.push(message);
                }
            }
        );
        assert.strictEqual(exitCode, 1);
        assert.deepStrictEqual(writes, [ 'Mutation report not found at "/definitely/missing/mutation-report.json"\n' ]);
    });

    test('runMutationTimeoutCheck writes invalid JSON errors and returns exit code 1', async function () {
        const reportPath = 'mutation-report.json';
        const result = await runCheckWithCollectedErrors(
            [ 'node', 'check', reportPath ],
            createFakeFileManager({
                simulatedReadFileResponses: [ {
                    value: '{'
                } ]
            })
        );
        assert.strictEqual(result.exitCode, 1);
        assert.ok((result.errors[0] ?? '').includes("Expected property name or '}'"));
    });

    test('runMutationTimeoutCheck stringifies non-Error failures', async function () {
        const errors: string[] = [];
        const exitCode = await runMutationTimeoutCheck(createArgumentValuesThrowingNonErrorOnReportPath(), {
            fileManager: createFakeFileManager(),
            standardErrorWrite() {
                throw new Error('standardErrorWrite should not be used when writeError is injected');
            },
            writeError(message) {
                errors.push(message);
            }
        });
        assert.strictEqual(exitCode, 1);
        assert.deepStrictEqual(errors, [ 'boom' ]);
    });
});
