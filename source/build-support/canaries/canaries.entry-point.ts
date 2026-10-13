import fileSystem from 'node:fs';
import path from 'node:path';
import { tmpdir as temporaryDirectory } from 'node:os';
import { createFileManager } from '../../file-manager/file-manager.ts';
import { formatCanarySummary, hasCanaryIssues, warningAnnotationMessages } from './canary-summary.ts';
import { runSelectedCanary, runShellCommand } from './canary-runner.ts';

type ParsedArguments = {
    readonly manifestPath: string;
    readonly name: string;
    readonly summaryPath: string;
};

type EntryPointDependencies = {
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

const fileManager = createFileManager({ hostFileSystem: fileSystem.promises });

function writeWarnings(
    messages: readonly string[],
    dependencies: EntryPointDependencies
): void {
    for (const message of messages) {
        dependencies.standardOutputWrite(`::warning::${escapeAnnotation(message)}\n`);
    }
}

async function runEntryPoint(
    argumentValues: readonly string[],
    dependencies: EntryPointDependencies
): Promise<void> {
    const parsedArguments = parseArguments(argumentValues);
    const result = await runSelectedCanary(parsedArguments.manifestPath, parsedArguments.name, {
        async createTemporaryFolder(prefix) {
            return await fileSystem.promises.mkdtemp(path.join(temporaryDirectory(), prefix));
        },
        fileManager,
        async removeFolder(folderPath) {
            await fileSystem.promises.rm(folderPath, { recursive: true, force: true });
        },
        repositoryFolder: process.cwd(),
        runCommand: runShellCommand
    });
    const summary = formatCanarySummary(result);
    if (parsedArguments.summaryPath.length > 0) {
        await fileManager.writeFile(parsedArguments.summaryPath, summary);
    }
    dependencies.standardOutputWrite(summary);
    writeWarnings(warningAnnotationMessages(result), dependencies);
    if (hasCanaryIssues(result)) {
        throw new Error(`Canary "${result.name}" reported ${result.issues.length} issue(s)`);
    }
}

try {
    await runEntryPoint(process.argv, {
        standardErrorWrite(message) {
            process.stderr.write(message);
        },
        standardOutputWrite(message) {
            process.stdout.write(message);
        }
    });
    process.exitCode = 0;
} catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`::warning::${escapeAnnotation(message)}\n`);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
}
