import type { FileManager } from '../../file-manager/file-manager.ts';
import { checkMutationTimeoutReport } from './check-mutation-timeouts.ts';

const defaultReportPath = 'target/stryker/mutation-report.json';
const reportPathArgumentIndex = 2;

type ErrorWriter = (message: string) => void;
type StandardErrorWriter = (message: string) => void;

export type MutationTimeoutCheckDependencies = {
    readonly fileManager: Pick<FileManager, 'readFile'>;
    readonly standardErrorWrite: StandardErrorWriter;
    readonly writeError?: ErrorWriter;
};

function resolveErrorWriter(dependencies: MutationTimeoutCheckDependencies): ErrorWriter {
    if (dependencies.writeError !== undefined) {
        return dependencies.writeError;
    }

    return function writeStandardErrorError(message) {
        dependencies.standardErrorWrite(`${message}\n`);
    };
}

async function runMutationTimeoutCheckWithoutErrorHandling(
    argumentValues: readonly string[],
    dependencies: MutationTimeoutCheckDependencies,
    writeError: ErrorWriter
): Promise<number> {
    const reportPath = argumentValues[reportPathArgumentIndex] ?? defaultReportPath;
    const failureMessage = await checkMutationTimeoutReport(reportPath, dependencies.fileManager);

    if (failureMessage !== undefined) {
        writeError(failureMessage);
        return 1;
    }

    return 0;
}

export async function runMutationTimeoutCheck(
    argumentValues: readonly string[],
    dependencies: MutationTimeoutCheckDependencies
): Promise<number> {
    const writeError = resolveErrorWriter(dependencies);
    try {
        return await runMutationTimeoutCheckWithoutErrorHandling(argumentValues, dependencies, writeError);
    } catch (error) {
        writeError(error instanceof Error ? error.message : String(error));
        return 1;
    }
}
