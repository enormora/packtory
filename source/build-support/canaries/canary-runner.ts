import path from 'node:path';
import { execFile } from 'node:child_process';
import type { FileManager } from '../../file-manager/file-manager.ts';
import { readCanaryManifest, selectCanary, type Canary, type CanaryManifest } from './canary-manifest.ts';
import { compareCanaryApis, type CanaryIssue } from './canary-comparison.ts';
import { writeCanaryConfigOverlay } from './canary-config-overlay.ts';
import { inspectPackageApis, runNodeImportProbe } from './package-api-inspection.ts';

type CommandResult = {
    readonly stderr: string;
    readonly stdout: string;
};

type CommandRunner = (command: string, cwd: string) => Promise<CommandResult>;
type TemporaryFolderCreator = (prefix: string) => Promise<string>;
type FolderRemover = (folderPath: string) => Promise<void>;
type ShellCommandFailure = {
    readonly command: string;
    readonly error: Error;
    readonly stderr: string;
    readonly stdout: string;
    readonly timeoutMs: number;
};

export type CanaryRunnerDependencies = {
    readonly createTemporaryFolder: TemporaryFolderCreator;
    readonly fileManager: Pick<
        FileManager,
        'checkReadability' | 'copyFile' | 'listDirectoryEntries' | 'readFile' | 'setExecutable' | 'writeFile'
    >;
    readonly removeFolder: FolderRemover;
    readonly runCommand: CommandRunner;
    readonly repositoryFolder: string;
};

export type CanaryRunResult = {
    readonly baselineResolvedRef: string;
    readonly candidateResolvedRef: string;
    readonly issues: readonly CanaryIssue[];
    readonly name: string;
};

type PacktoryMode = 'baseline' | 'candidate';

type PreparedClone = {
    readonly cloneFolder: string;
    readonly nodeModulesFolder: string;
    readonly resolvedRef: string;
};

type PacktoryRunResult = {
    readonly error: string;
    readonly failed: true;
    readonly resolvedRef: string;
} | {
    readonly failed: false;
    readonly inspection: Awaited<ReturnType<typeof inspectPackageApis>>;
    readonly resolvedRef: string;
};

const packOutputFolderName = 'packtory-canary-packages';
const millisecondsPerSecond = 1000;
const secondsPerMinute = 60;
const shellCommandTimeoutMinutes = 15;
const shellCommandTimeoutMs = shellCommandTimeoutMinutes * secondsPerMinute * millisecondsPerSecond;

function shellScript(content: string): string {
    return `#!/usr/bin/env sh\n${content}\n`;
}

function shellQuote(value: string): string {
    return `'${value.replaceAll("'", "'\\''")}'`;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function packtoryBinPath(cloneFolder: string): string {
    return path.join(cloneFolder, 'node_modules', '.bin', 'packtory');
}

function canarySourcePacktoryCommand(repositoryFolder: string): string {
    return `${JSON.stringify(process.execPath)} --experimental-strip-types --enable-source-maps ${
        JSON.stringify(path.join(
            repositoryFolder,
            'source/packages/command-line-interface/command-line-interface.entry-point.ts'
        ))
    }`;
}

async function installBaselinePacktoryCli(
    dependencies: CanaryRunnerDependencies,
    cloneFolder: string
): Promise<void> {
    await dependencies.runCommand('npm install --no-save --ignore-scripts @packtory/cli@latest', cloneFolder);
}

async function writeCandidatePacktoryShim(
    dependencies: CanaryRunnerDependencies,
    cloneFolder: string
): Promise<void> {
    const shimPath = packtoryBinPath(cloneFolder);
    const content = shellScript(`exec ${canarySourcePacktoryCommand(dependencies.repositoryFolder)} "$@"`);
    await dependencies.fileManager.writeFile(shimPath, content);
    await dependencies.fileManager.setExecutable(shimPath, true);
}

async function installPacktoryCli(
    dependencies: CanaryRunnerDependencies,
    cloneFolder: string,
    mode: PacktoryMode
): Promise<void> {
    if (mode === 'baseline') {
        await installBaselinePacktoryCli(dependencies, cloneFolder);
    } else {
        await writeCandidatePacktoryShim(dependencies, cloneFolder);
    }
}

async function prepareCanaryClone(
    dependencies: CanaryRunnerDependencies,
    canary: Canary,
    mode: PacktoryMode,
    cloneFolder: string
): Promise<PreparedClone> {
    await dependencies.runCommand(
        `git clone --depth 1 --branch ${JSON.stringify(canary.ref)} ${JSON.stringify(canary.repository)} .`,
        cloneFolder
    );
    await dependencies.runCommand('git fetch --tags --force', cloneFolder);
    const revParseResult = await dependencies.runCommand('git rev-parse HEAD', cloneFolder);
    const resolvedRef = revParseResult.stdout.trim();
    await dependencies.runCommand(canary.installCommand, cloneFolder);
    await installPacktoryCli(dependencies, cloneFolder, mode);
    return {
        cloneFolder,
        nodeModulesFolder: path.join(cloneFolder, packOutputFolderName, 'node_modules'),
        resolvedRef
    };
}

function canaryPreparationFailures(results: readonly PromiseSettledResult<unknown>[]): readonly unknown[] {
    return results.flatMap(function (result): readonly unknown[] {
        return result.status === 'rejected' ? [ result.reason as unknown ] : [];
    });
}

async function cloneRepository(
    dependencies: CanaryRunnerDependencies,
    canary: Canary,
    mode: PacktoryMode
): Promise<PreparedClone> {
    const cloneFolder = await dependencies.createTemporaryFolder(`packtory-canary-${canary.name}-${mode}-`);
    const [ preparation ] = await Promise.allSettled([
        prepareCanaryClone(dependencies, canary, mode, cloneFolder)
    ]);
    if (preparation.status === 'fulfilled') {
        return preparation.value;
    }
    const cleanup = await Promise.allSettled([ dependencies.removeFolder(cloneFolder) ]);
    const errors = [ ...canaryPreparationFailures([ preparation ]), ...canaryPreparationFailures(cleanup) ];
    throw new AggregateError(errors, errors.map(errorMessage).join('\n'));
}

async function prepareCanaryClones(
    dependencies: CanaryRunnerDependencies,
    canary: Canary
): Promise<readonly [PreparedClone, PreparedClone]> {
    const [ baseline, candidate ] = await Promise.allSettled([
        cloneRepository(dependencies, canary, 'baseline'),
        cloneRepository(dependencies, canary, 'candidate')
    ]);
    if (baseline.status === 'fulfilled' && candidate.status === 'fulfilled') {
        return [ baseline.value, candidate.value ];
    }
    const cleanup = await Promise.allSettled([ baseline, candidate ].flatMap(function (result) {
        return result.status === 'fulfilled' ? [ dependencies.removeFolder(result.value.cloneFolder) ] : [];
    }));
    const errors = [ ...canaryPreparationFailures([ baseline, candidate ]), ...canaryPreparationFailures(cleanup) ];
    throw new AggregateError(errors, errors.map(errorMessage).join('\n'));
}

async function packGeneratedPackages(
    dependencies: CanaryRunnerDependencies,
    clone: PreparedClone
): Promise<void> {
    await dependencies.runCommand(
        [
            'packtory pack --all',
            '--format folder',
            '--version 0.0.0',
            '--vendor-dependencies',
            `--out ${JSON.stringify(path.join(clone.cloneFolder, packOutputFolderName, 'node_modules'))}`
        ]
            .join(' '),
        clone.cloneFolder
    );
}

async function runPacktoryInClone(
    dependencies: CanaryRunnerDependencies,
    canary: Canary,
    clone: PreparedClone
): Promise<PacktoryRunResult> {
    try {
        await dependencies.runCommand(canary.publishCommand, clone.cloneFolder);
        await writeCanaryConfigOverlay({ cloneFolder: clone.cloneFolder, fileManager: dependencies.fileManager });
        await packGeneratedPackages(dependencies, clone);
        return {
            failed: false,
            inspection: await inspectPackageApis({
                fileManager: dependencies.fileManager,
                nodeModulesFolder: clone.nodeModulesFolder,
                nodeTypeDefinitionsFolder: path.join(dependencies.repositoryFolder, 'node_modules', '@types'),
                runImportProbe: runNodeImportProbe
            }),
            resolvedRef: clone.resolvedRef
        };
    } catch (error: unknown) {
        return {
            error: errorMessage(error),
            failed: true,
            resolvedRef: clone.resolvedRef
        };
    } finally {
        await dependencies.removeFolder(clone.cloneFolder);
    }
}

function failureIssues(
    baseline: PacktoryRunResult,
    candidate: PacktoryRunResult,
    publishCommand: string
): readonly CanaryIssue[] {
    if (baseline.failed && candidate.failed) {
        return [
            {
                kind: 'baseline-rot',
                message: `npm baseline failed while running "${publishCommand}":\n${baseline.error}`
            },
            {
                kind: 'baseline-rot',
                message: `source run also failed while running "${publishCommand}":\n${candidate.error}`
            }
        ];
    }
    if (baseline.failed) {
        return [
            {
                kind: 'baseline-rot',
                message: `npm baseline failed while running "${publishCommand}":\n${baseline.error}`
            },
            { kind: 'warning', message: 'source run passed while the npm baseline failed' }
        ];
    }
    if (candidate.failed) {
        return [ {
            kind: 'regression',
            message: [
                `source run failed while running "${publishCommand}" after the npm baseline passed:`,
                candidate.error
            ]
                .join('\n')
        } ];
    }
    return [];
}

function compareRuns(
    baseline: PacktoryRunResult,
    candidate: PacktoryRunResult,
    publishCommand: string
): readonly CanaryIssue[] {
    const failures = failureIssues(baseline, candidate, publishCommand);
    if (failures.length > 0) {
        return failures;
    }
    if (baseline.failed || candidate.failed) {
        return failures;
    }
    return compareCanaryApis(baseline.inspection, candidate.inspection).issues;
}

async function runCanary(
    canary: Canary,
    dependencies: CanaryRunnerDependencies
): Promise<CanaryRunResult> {
    const [ baselineClone, candidateClone ] = await prepareCanaryClones(dependencies, canary);
    const baseline = await runPacktoryInClone(dependencies, canary, baselineClone);
    const candidate = await runPacktoryInClone(dependencies, canary, candidateClone);
    return {
        baselineResolvedRef: baseline.resolvedRef,
        candidateResolvedRef: candidate.resolvedRef,
        issues: compareRuns(baseline, candidate, canary.publishCommand),
        name: canary.name
    };
}

export async function runSelectedCanary(
    manifestPath: string,
    name: string,
    dependencies: CanaryRunnerDependencies
): Promise<CanaryRunResult> {
    const manifest: CanaryManifest = await readCanaryManifest(manifestPath, dependencies.fileManager);
    return await runCanary(selectCanary(manifest, name), dependencies);
}

function shellCommandErrorProperty(error: Error, property: string): unknown {
    return Object.getOwnPropertyDescriptor(error, property)?.value;
}

function shellCommandErrorMessage(input: ShellCommandFailure): string {
    const signal = shellCommandErrorProperty(input.error, 'signal');
    const killed = shellCommandErrorProperty(input.error, 'killed');
    const timeout = input.timeoutMs < millisecondsPerSecond
        ? `${input.timeoutMs} ms`
        : `${Math.round(input.timeoutMs / millisecondsPerSecond)} seconds`;
    const details = killed === true && signal === 'SIGTERM'
        ? `Command timed out after ${timeout}: ${input.command}`
        : input.error.message;
    return [ input.stdout.trim(), input.stderr.trim(), details ].filter(Boolean).join('\n');
}

async function runShellCommandWithTimeout(
    command: string,
    cwd: string,
    timeoutMs: number
): Promise<CommandResult> {
    return new Promise(function (resolve, reject) {
        const nodeModulesBinPath = path.join(cwd, 'node_modules', '.bin');
        const shellCommand = [
            `PATH=${shellQuote(nodeModulesBinPath)}:$PATH`,
            'export PATH',
            'NPM_TOKEN=dry-run',
            'export NPM_TOKEN',
            command
        ]
            .join('\n');
        execFile(
            '/usr/bin/env',
            [ 'sh', '-lc', shellCommand ],
            { cwd, encoding: 'utf8', timeout: timeoutMs },
            function (error, stdout, stderr) {
                if (error === null) {
                    resolve({ stdout, stderr });
                    return;
                }
                reject(new Error(shellCommandErrorMessage({ command, error, stderr, stdout, timeoutMs })));
            }
        );
    });
}

export async function runShellCommand(
    command: string,
    cwd: string
): Promise<CommandResult> {
    return await runShellCommandWithTimeout(command, cwd, shellCommandTimeoutMs);
}
