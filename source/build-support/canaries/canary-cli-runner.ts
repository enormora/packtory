import type { FileManager } from '../../file-manager/file-manager.ts';
import type { CanaryRunResult } from './canary-runner.ts';
import { formatCanarySummary, warningAnnotationMessages } from './canary-summary.ts';

type ParsedArguments = {
    readonly manifestPath: string;
    readonly name: string;
    readonly summaryPath: string;
};

type CanaryCliDependencies = {
    readonly fileManager: Pick<FileManager, 'writeFile'>;
    readonly runCanary: (manifestPath: string, name: string) => Promise<CanaryRunResult>;
    readonly stderrWrite: (message: string) => void;
    readonly stdoutWrite: (message: string) => void;
};

function argumentValue(argv: readonly string[], name: string): string | undefined {
    const index = argv.indexOf(name);
    return index === -1 ? undefined : argv[index + 1];
}

function parseArguments(argv: readonly string[]): ParsedArguments {
    const manifestPath = argumentValue(argv, '--manifest') ?? 'canary-tests/canaries.json';
    const name = argumentValue(argv, '--name');
    const summaryPath = argumentValue(argv, '--summary') ?? '';
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
    dependencies: CanaryCliDependencies
): void {
    for (const message of messages) {
        dependencies.stdoutWrite(`::warning::${escapeAnnotation(message)}\n`);
    }
}

async function reportCanary(
    argv: readonly string[],
    dependencies: CanaryCliDependencies
): Promise<void> {
    const args = parseArguments(argv);
    const result = await dependencies.runCanary(args.manifestPath, args.name);
    const summary = formatCanarySummary(result);
    if (args.summaryPath.length > 0) {
        await dependencies.fileManager.writeFile(args.summaryPath, summary);
    }
    dependencies.stdoutWrite(summary);
    writeWarnings(warningAnnotationMessages(result), dependencies);
}

export async function runCanaryCli(argv: readonly string[], dependencies: CanaryCliDependencies): Promise<number> {
    try {
        await reportCanary(argv, dependencies);
        return 0;
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        dependencies.stdoutWrite(`::warning::${escapeAnnotation(message)}\n`);
        dependencies.stderrWrite(`${message}\n`);
        return 1;
    }
}
