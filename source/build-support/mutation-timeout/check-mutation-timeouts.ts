import type { FileManager } from '../../file-manager/file-manager.ts';
import { readMutationReport } from './mutation-report-reader.ts';
import { formatMutationTimeoutError } from './timeout-error-formatter.ts';
import { collectTimeoutMutants } from './timeout-mutant-collector.ts';

export async function checkMutationTimeoutReport(
    reportPath: string,
    fileManager: Pick<FileManager, 'readFile'>
): Promise<string | undefined> {
    const report = await readMutationReport(reportPath, fileManager);
    return formatMutationTimeoutError(collectTimeoutMutants(report));
}
