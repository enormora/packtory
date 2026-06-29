import type { FileManager } from '../../file-manager/file-manager.ts';
import { checkMutationTimeoutReport } from './check-mutation-timeouts.ts';

const defaultReportPath = 'target/stryker/mutation-report.json';
const reportPathArgIndex = 2;

type ErrorWriter = (message: string) => void;
type StderrWriter = (message: string) => void;

export type MutationTimeoutCheckDependencies = {
    readonly fileManager: Pick<FileManager, 'readFile'>;
    readonly stderrWrite: StderrWriter;
    readonly writeError?: ErrorWriter;
};

function resolveErrorWriter(dependencies: MutationTimeoutCheckDependencies): ErrorWriter {
    if (dependencies.writeError !== undefined) {
        return dependencies.writeError;
    }

    return function writeStderrError(message) {
        dependencies.stderrWrite(`${message}\n`);
    };
}

async function runMutationTimeoutCheckWithoutErrorHandling(
    argv: readonly string[],
    dependencies: MutationTimeoutCheckDependencies,
    writeError: ErrorWriter
): Promise<number> {
    const reportPath = argv[reportPathArgIndex] ?? defaultReportPath;
    const failureMessage = await checkMutationTimeoutReport(reportPath, dependencies.fileManager);

    if (failureMessage !== undefined) {
        writeError(failureMessage);
        return 1;
    }

    return 0;
}

export async function runMutationTimeoutCheck(
    argv: readonly string[],
    dependencies: MutationTimeoutCheckDependencies
): Promise<number> {
    const writeError = resolveErrorWriter(dependencies);
    try {
        return await runMutationTimeoutCheckWithoutErrorHandling(argv, dependencies, writeError);
    } catch (error) {
        writeError(error instanceof Error ? error.message : String(error));
        return 1;
    }
}
