import type { FileManager } from '../../file-manager/file-manager.ts';
import { type MutationReport, parseMutationReport } from './mutation-report-schema.ts';

function isErrorWithCode(error: unknown, code: string): error is Error & { readonly code: string } {
    return error instanceof Error && Reflect.get(error, 'code') === code;
}

export async function readMutationReport(
    reportPath: string,
    fileManager: Pick<FileManager, 'readFile'>
): Promise<MutationReport> {
    try {
        return parseMutationReport(JSON.parse(await fileManager.readFile(reportPath)) as unknown);
    } catch (error) {
        if (isErrorWithCode(error, 'ENOENT')) {
            throw new Error(`Mutation report not found at "${reportPath}"`, { cause: error });
        }

        throw error;
    }
}
