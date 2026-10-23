import type { FileManager } from '../../file-manager/file-manager.ts';
import type { CanaryRunResult } from './canary-runner.ts';
import { formatCanarySummary, warningAnnotationMessages } from './canary-summary.ts';

type ParsedArguments = {
    readonly manifestPath: string;
    readonly name: string;
    readonly summaryPath: string;
};

type CanaryCommandLineInterfaceDependencies = {
    readonly fileManager: Pick<FileManager, 'writeFile'>;
    readonly runCanary: (manifestPath: string, name: string) => Promise<CanaryRunResult>;
    readonly standardErrorWrite: (message: string) => void;
    readonly standardOutputWrite: (message: string) => void;
};

function argumentValue(argumentValues: readonly string[], name: string): string | undefined {
    const index = argumentValues.indexOf(name);
    return index === -1 ? undefined : argumentValues[index + 1];
}

function parseArguments(argumentValues: readonly string[]): ParsedArguments {
    const manifestPath = argumentValue(argumentValues, '--manifest') ?? 'canary-tests/canaries.json';
    const name = argumentValue(argumentValues, '--name');
    const summaryPath = argumentValue(argumentValues, '--summary') ?? '';
    if (name === undefined) {
        throw new Error('Missing required --name argument');
    }
    return { manifestPath, name, summaryPath };
}

function escapeAnnotation(message: string): string {
    return message
        .replaceAll('%', '%25')
        .replaceAll('\r', '%0D')
        .replaceAll('\n', '%0A');
}

function writeWarnings(
    messages: readonly string[],
    dependencies: CanaryCommandLineInterfaceDependencies
): void {
    for (const message of messages) {
        dependencies.standardOutputWrite(`::warning::${escapeAnnotation(message)}\n`);
    }
}

async function reportCanary(
    argumentValues: readonly string[],
    dependencies: CanaryCommandLineInterfaceDependencies
): Promise<void> {
    const parsedArguments = parseArguments(argumentValues);
    const result = await dependencies.runCanary(parsedArguments.manifestPath, parsedArguments.name);
    const summary = formatCanarySummary(result);
    if (parsedArguments.summaryPath.length > 0) {
        await dependencies.fileManager.writeFile(parsedArguments.summaryPath, summary);
    }
    dependencies.standardOutputWrite(summary);
    writeWarnings(warningAnnotationMessages(result), dependencies);
}

export async function runCanaryCommandLineInterface(
    argumentValues: readonly string[],
    dependencies: CanaryCommandLineInterfaceDependencies
): Promise<number> {
    try {
        await reportCanary(argumentValues, dependencies);
        return 0;
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        dependencies.standardOutputWrite(`::warning::${escapeAnnotation(message)}\n`);
        dependencies.standardErrorWrite(`${message}\n`);
        return 1;
    }
}
