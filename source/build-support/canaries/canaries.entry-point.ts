import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createFileManager } from '../../file-manager/file-manager.ts';
import { formatCanarySummary, hasCanaryIssues, warningAnnotationMessages } from './canary-summary.ts';
import { runSelectedCanary, runShellCommand } from './canary-runner.ts';

type ParsedArguments = {
    readonly manifestPath: string;
    readonly name: string;
    readonly summaryPath: string;
};

type EntryPointDependencies = {
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

const fileManager = createFileManager({ hostFileSystem: fs.promises });

function writeWarnings(
    messages: readonly string[],
    dependencies: EntryPointDependencies
): void {
    for (const message of messages) {
        dependencies.stdoutWrite(`::warning::${escapeAnnotation(message)}\n`);
    }
}

async function runEntryPoint(
    argv: readonly string[],
    dependencies: EntryPointDependencies
): Promise<void> {
    const args = parseArguments(argv);
    const result = await runSelectedCanary(args.manifestPath, args.name, {
        async createTemporaryFolder(prefix) {
            return await fs.promises.mkdtemp(path.join(tmpdir(), prefix));
        },
        fileManager,
        async removeFolder(folderPath) {
            await fs.promises.rm(folderPath, { recursive: true, force: true });
        },
        repositoryFolder: process.cwd(),
        runCommand: runShellCommand
    });
    const summary = formatCanarySummary(result);
    if (args.summaryPath.length > 0) {
        await fileManager.writeFile(args.summaryPath, summary);
    }
    dependencies.stdoutWrite(summary);
    writeWarnings(warningAnnotationMessages(result), dependencies);
    if (hasCanaryIssues(result)) {
        throw new Error(`Canary "${result.name}" reported ${result.issues.length} issue(s)`);
    }
}

try {
    await runEntryPoint(process.argv, {
        stderrWrite(message) {
            process.stderr.write(message);
        },
        stdoutWrite(message) {
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
