import assert from 'node:assert';
import { test } from 'mocha';
import { createFakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import {
    killedMutant,
    singleMutantReport,
    timeoutMutant,
    withTemporaryReportDirectory
} from '../../test-libraries/mutation-report-fixtures.ts';
import { checkMutationTimeoutReport } from './check-mutation-timeouts.ts';

test('checkMutationTimeoutReport returns undefined for a report without timeout mutants', async () => {
    await withTemporaryReportDirectory(
        'mutation-report.json',
        JSON.stringify(singleMutantReport(killedMutant)),
        async (reportPath) => {
            const fileManager = createFakeFileManager({
                simulatedReadFileResponses: [{ value: JSON.stringify(singleMutantReport(killedMutant)) }]
            });

            assert.strictEqual(await checkMutationTimeoutReport(reportPath, fileManager), undefined);
        }
    );
});

test('checkMutationTimeoutReport returns the formatted failure message for timeout mutants', async () => {
    await withTemporaryReportDirectory(
        'mutation-report.json',
        JSON.stringify(singleMutantReport(timeoutMutant)),
        async (reportPath) => {
            const fileManager = createFakeFileManager({
                simulatedReadFileResponses: [{ value: JSON.stringify(singleMutantReport(timeoutMutant)) }]
            });

            assert.strictEqual(
                await checkMutationTimeoutReport(reportPath, fileManager),
                ['Mutation report contains 1 timeout mutant.', '- source/a.ts:7:8'].join('\n')
            );
        }
    );
});

test('checkMutationTimeoutReport passes the requested report path to the file manager', async () => {
    const fileManager = createFakeFileManager({ simulatedReadFileResponses: [{ value: '{}' }] });

    await checkMutationTimeoutReport('some/path.json', fileManager);

    assert.deepStrictEqual(fileManager.getReadFileCall(0), { filePath: 'some/path.json' });
});
