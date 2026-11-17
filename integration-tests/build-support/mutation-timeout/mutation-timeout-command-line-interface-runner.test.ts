import assert from 'node:assert';
import { execFile as executeFile } from 'node:child_process';
import { fileURLToPath as fileAddressToPath } from 'node:url';
import { suite, test } from 'mocha';

import {
    killedMutant,
    singleMutantReport,
    withTemporaryReportDirectory
} from '../../../source/test-libraries/mutation-report-fixtures.ts';

const checkerScriptPath = fileAddressToPath(
    new URL('../../../source/build-support/mutation-timeout/check-mutation-timeouts.entry-point.ts', import.meta.url)
);
const defaultReportFilePath = 'target/stryker/mutation-report.json';

async function withDefaultReport<T>(report: unknown, action: (directory: string) => Promise<T>): Promise<T> {
    return withTemporaryReportDirectory(
        defaultReportFilePath,
        JSON.stringify(report),
        async function (_reportPath, directory) {
            return action(directory);
        }
    );
}
async function runCheckerCommandLineInterface(extraArguments: readonly string[], cwd: string): Promise<{
    readonly exitCode: number;
    readonly standardError: string;
}> {
    return new Promise(function (resolve) {
        executeFile(process.execPath, [
            '--experimental-strip-types',
            '--enable-source-maps',
            checkerScriptPath,
            ...extraArguments
        ], {
            cwd,
            encoding: 'utf8'
        }, function (error, _standardOutput, standardError) {
            resolve({
                exitCode: typeof error?.code === 'number' ? error.code : 0,
                standardError
            });
        });
    });
}

suite('mutation-timeout-cli-runner', function () {
    test('CLI uses the default report path and exits with code 0 when there are no timeout mutants', async function () {
        await withDefaultReport(singleMutantReport(killedMutant), async function (directory) {
            const result = await runCheckerCommandLineInterface([], directory);
            assert.partialDeepStrictEqual(result, {
                exitCode: 0,
                standardError: ''
            });
        });
    });
});
