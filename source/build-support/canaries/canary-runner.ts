import path from 'node:path';
import { execFile as executeFile } from 'node:child_process';
import type { FileManager } from '../../file-manager/file-manager.ts';
import { readCanaryManifest, selectCanary, type Canary, type CanaryManifest } from './canary-manifest.ts';
import { compareCanaryApplicationProgrammingInterfaces, type CanaryIssue } from './canary-comparison.ts';
import { writeCanaryConfigurationOverlay } from './canary-configuration-overlay.ts';
import {
    inspectPackageApplicationProgrammingInterfaces,
    runNodeImportProbe
} from './package-application-programming-interface-inspection.ts';

type CommandResult = {
    readonly standardError: string;
    readonly standardOutput: string;
};

type CommandRunner = (command: string, cwd: string) => Promise<CommandResult>;
type TemporaryFolderCreator = (prefix: string) => Promise<string>;
type FolderRemover = (folderPath: string) => Promise<void>;
type ShellCommandFailure = {
    readonly command: string;
    readonly error: Error;
    readonly standardError: string;
    readonly standardOutput: string;
    readonly timeoutMilliseconds: number;
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
    readonly baselineResolvedReference: string;
    readonly candidateResolvedReference: string;
    readonly issues: readonly CanaryIssue[];
    readonly name: string;
};

type PacktoryMode = 'baseline' | 'candidate';

type PreparedClone = {
    readonly cloneFolder: string;
    readonly nodeModulesFolder: string;
    readonly resolvedReference: string;
};

type PacktoryRunResult = {
    readonly error: string;
    readonly failed: true;
    readonly resolvedReference: string;
} | {
    readonly failed: false;
    readonly inspection: Awaited<ReturnType<typeof inspectPackageApplicationProgrammingInterfaces>>;
    readonly resolvedReference: string;
};

const packOutputFolderName = 'packtory-canary-packages';
const millisecondsPerSecond = 1000;
const secondsPerMinute = 60;
const shellCommandTimeoutMinutes = 15;
const shellCommandTimeoutMilliseconds = shellCommandTimeoutMinutes * secondsPerMinute * millisecondsPerSecond;

function shellScript(content: string): string {
    return `#!/usr/bin/env sh\n${content}\n`;
}

function shellQuote(value: string): string {
    return `'${value.replaceAll("'", "'\\''")}'`;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function packtoryExecutablePath(cloneFolder: string): string {
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

async function installBaselinePacktoryCommandLineInterface(
    dependencies: CanaryRunnerDependencies,
    cloneFolder: string
): Promise<void> {
    await dependencies.runCommand('npm install --no-save --ignore-scripts @packtory/cli@latest', cloneFolder);
}

async function writeCandidatePacktoryShim(
    dependencies: CanaryRunnerDependencies,
    cloneFolder: string
): Promise<void> {
    const shimPath = packtoryExecutablePath(cloneFolder);
    const content = shellScript(`exec ${canarySourcePacktoryCommand(dependencies.repositoryFolder)} "$@"`);
    await dependencies.fileManager.writeFile(shimPath, content);
    await dependencies.fileManager.setExecutable(shimPath, true);
}

async function installPacktoryCommandLineInterface(
    dependencies: CanaryRunnerDependencies,
    cloneFolder: string,
    mode: PacktoryMode
): Promise<void> {
    if (mode === 'baseline') {
        await installBaselinePacktoryCommandLineInterface(dependencies, cloneFolder);
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
        `git clone --depth 1 --branch ${JSON.stringify(canary.reference)} ${JSON.stringify(canary.repository)} .`,
        cloneFolder
    );
    await dependencies.runCommand('git fetch --tags --force', cloneFolder);
    const revisionParseResult = await dependencies.runCommand('git rev-parse HEAD', cloneFolder);
    const resolvedReference = revisionParseResult.standardOutput.trim();
    await dependencies.runCommand(canary.installCommand, cloneFolder);
    await installPacktoryCommandLineInterface(dependencies, cloneFolder, mode);
    return {
        cloneFolder,
        nodeModulesFolder: path.join(cloneFolder, packOutputFolderName, 'node_modules'),
        resolvedReference
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
        await writeCanaryConfigurationOverlay({
            cloneFolder: clone.cloneFolder,
            fileManager: dependencies.fileManager
        });
        await packGeneratedPackages(dependencies, clone);
        return {
            failed: false,
            inspection: await inspectPackageApplicationProgrammingInterfaces({
                fileManager: dependencies.fileManager,
                nodeModulesFolder: clone.nodeModulesFolder,
                nodeTypeDefinitionsFolder: path.join(dependencies.repositoryFolder, 'node_modules', '@types'),
                runImportProbe: runNodeImportProbe
            }),
            resolvedReference: clone.resolvedReference
        };
    } catch (error: unknown) {
        return {
            error: errorMessage(error),
            failed: true,
            resolvedReference: clone.resolvedReference
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
    return compareCanaryApplicationProgrammingInterfaces(baseline.inspection, candidate.inspection).issues;
}

async function runCanary(
    canary: Canary,
    dependencies: CanaryRunnerDependencies
): Promise<CanaryRunResult> {
    const [ baselineClone, candidateClone ] = await prepareCanaryClones(dependencies, canary);
    const baseline = await runPacktoryInClone(dependencies, canary, baselineClone);
    const candidate = await runPacktoryInClone(dependencies, canary, candidateClone);
    return {
        baselineResolvedReference: baseline.resolvedReference,
        candidateResolvedReference: candidate.resolvedReference,
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
    const timeout = input.timeoutMilliseconds < millisecondsPerSecond
        ? `${input.timeoutMilliseconds} ms`
        : `${Math.round(input.timeoutMilliseconds / millisecondsPerSecond)} seconds`;
    const details = killed === true && signal === 'SIGTERM'
        ? `Command timed out after ${timeout}: ${input.command}`
        : input.error.message;
    return [ input.standardOutput.trim(), input.standardError.trim(), details ].filter(Boolean).join('\n');
}

async function runShellCommandWithTimeout(
    command: string,
    cwd: string,
    timeoutMilliseconds: number
): Promise<CommandResult> {
    return new Promise(function (resolve, reject) {
        const nodeModulesExecutablePath = path.join(cwd, 'node_modules', '.bin');
        const shellCommand = [
            `PATH=${shellQuote(nodeModulesExecutablePath)}:$PATH`,
            'export PATH',
            'NPM_TOKEN=dry-run',
            'export NPM_TOKEN',
            command
        ]
            .join('\n');
        executeFile(
            '/usr/bin/env',
            [ 'sh', '-lc', shellCommand ],
            { cwd, encoding: 'utf8', timeout: timeoutMilliseconds },
            function (error, standardOutput, standardError) {
                if (error === null) {
                    resolve({ standardOutput, standardError });
                    return;
                }
                reject(
                    new Error(
                        shellCommandErrorMessage({ command, error, standardError, standardOutput, timeoutMilliseconds })
                    )
                );
            }
        );
    });
}

export async function runShellCommand(
    command: string,
    cwd: string
): Promise<CommandResult> {
    return await runShellCommandWithTimeout(command, cwd, shellCommandTimeoutMilliseconds);
}
