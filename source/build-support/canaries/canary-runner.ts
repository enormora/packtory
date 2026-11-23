import type { ExecFileException as ExecuteFileException } from 'node:child_process';
import path from 'node:path';
import { errorMessage } from '../../common/error-normalization.ts';
import type { FileManager } from '../../file-manager/file-manager.ts';
import { compareCanaryApplicationProgrammingInterfaces, type CanaryIssue } from './canary-comparison.ts';
import { writeCanaryConfigurationOverlay } from './canary-configuration-overlay.ts';
import { readCanaryManifest, selectCanary, type Canary, type CanaryManifest } from './canary-manifest.ts';
import {
    inspectPackageApplicationProgrammingInterfaces,
    type CanaryProcessExecutor,
    type InspectPackagesInput
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
    readonly error: ExecuteFileException;
    readonly standardError: string;
    readonly standardOutput: string;
    readonly timeoutMilliseconds: number;
};

type CanaryFileReader = Pick<FileManager, 'checkReadability' | 'listDirectoryEntries' | 'readFile'>;
type CanaryFileWriter = Pick<FileManager, 'copyDirectory' | 'copyFile' | 'setExecutable' | 'writeFile'>;

export type CanaryRunnerDependencies = {
    readonly createProject: InspectPackagesInput['createProject'];
    readonly createTemporaryFolder: TemporaryFolderCreator;
    readonly fileManager: CanaryFileReader & CanaryFileWriter;
    readonly now: () => number;
    readonly recordPackDuration: (mode: PacktoryMode, durationMilliseconds: number) => void;
    readonly removeFolder: FolderRemover;
    readonly runCommand: CommandRunner;
    readonly runImportProbe: InspectPackagesInput['runImportProbe'];
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
    readonly mode: PacktoryMode;
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

function shellScript(content: string): string {
    return `#!/usr/bin/env sh\n${content}\n`;
}

function shellQuote(value: string): string {
    return `'${value.replaceAll("'", "'\\''")}'`;
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

function hasPublishCommand(canary: Canary): canary is Extract<Canary, { readonly publishCommand: string; }> {
    return Object.hasOwn(canary, 'publishCommand');
}

async function installCanaryVariant(
    dependencies: CanaryRunnerDependencies,
    canary: Canary,
    clone: PreparedClone
): Promise<void> {
    if (hasPublishCommand(canary)) {
        await dependencies.runCommand(canary.installCommand, clone.cloneFolder);
    }
    if (clone.mode === 'baseline') {
        await installBaselinePacktoryCommandLineInterface(dependencies, clone.cloneFolder);
    } else {
        await writeCandidatePacktoryShim(dependencies, clone.cloneFolder);
    }
}

async function prepareCanaryRepository(
    dependencies: CanaryRunnerDependencies,
    canary: Canary,
    cloneFolder: string
): Promise<string> {
    await dependencies.runCommand(
        `git clone --depth 1 --branch ${shellQuote(canary.reference)} ${shellQuote(canary.repository)} .`,
        cloneFolder
    );
    await dependencies.runCommand('git fetch --tags --force', cloneFolder);
    const revision = await dependencies.runCommand('git rev-parse HEAD', cloneFolder);
    return revision.standardOutput.trim();
}

function canaryPreparationFailures(results: readonly PromiseSettledResult<unknown>[]): readonly unknown[] {
    return results.flatMap(function (result): readonly unknown[] {
        return result.status === 'rejected' ? [ result.reason as unknown ] : [];
    });
}

async function withCanaryClone<Result>(
    dependencies: CanaryRunnerDependencies,
    name: string,
    mode: PacktoryMode,
    run: (cloneFolder: string) => Promise<Result>
): Promise<Result> {
    const cloneFolder = await dependencies.createTemporaryFolder(`packtory-canary-${name}-${mode}-`);
    const [ runResult ] = await Promise.allSettled([ run(cloneFolder) ]);
    const cleanup = await Promise.allSettled([ dependencies.removeFolder(cloneFolder) ]);
    const errors = [ ...canaryPreparationFailures([ runResult ]), ...canaryPreparationFailures(cleanup) ];
    if (runResult.status === 'fulfilled' && errors.length === 0) {
        return runResult.value;
    }
    throw new AggregateError(errors, errors.map(errorMessage).join('\n'));
}

function preparedClone(cloneFolder: string, mode: PacktoryMode, resolvedReference: string): PreparedClone {
    return {
        cloneFolder,
        mode,
        nodeModulesFolder: path.join(cloneFolder, packOutputFolderName, 'node_modules'),
        resolvedReference
    };
}

async function packGeneratedPackages(
    dependencies: CanaryRunnerDependencies,
    clone: PreparedClone
): Promise<void> {
    const started = dependencies.now();
    await dependencies.runCommand(
        [
            'packtory pack --all',
            '--format folder',
            '--version 0.0.0',
            '--vendor-dependencies',
            `--out ${JSON.stringify(clone.nodeModulesFolder)}`
        ]
            .join(' '),
        clone.cloneFolder
    );
    dependencies.recordPackDuration(clone.mode, dependencies.now() - started);
}

async function captureCanaryFailure(work: () => Promise<void>): Promise<string | undefined> {
    try {
        await work();
        return undefined;
    } catch (error: unknown) {
        return errorMessage(error);
    }
}

async function verifyCanaryClone(
    dependencies: CanaryRunnerDependencies,
    canary: Canary,
    clone: PreparedClone
): Promise<string | undefined> {
    return await captureCanaryFailure(async function () {
        if (hasPublishCommand(canary)) {
            await dependencies.runCommand(canary.publishCommand, clone.cloneFolder);
        }
        for (const command of canary.verificationCommands) {
            await dependencies.runCommand(command, clone.cloneFolder);
        }
    });
}

async function packCanaryClone(
    dependencies: CanaryRunnerDependencies,
    clone: PreparedClone,
    verificationFailure: string | undefined
): Promise<string | undefined> {
    if (verificationFailure !== undefined) {
        return verificationFailure;
    }
    return await captureCanaryFailure(async function () {
        await writeCanaryConfigurationOverlay({
            cloneFolder: clone.cloneFolder,
            fileManager: dependencies.fileManager
        });
        await packGeneratedPackages(dependencies, clone);
    });
}

function failedCanaryRun(clone: PreparedClone, error: string): PacktoryRunResult {
    return { error, failed: true, resolvedReference: clone.resolvedReference };
}

async function inspectCanaryClone(
    dependencies: CanaryRunnerDependencies,
    clone: PreparedClone,
    packagingFailure: string | undefined
): Promise<PacktoryRunResult> {
    if (packagingFailure !== undefined) {
        return failedCanaryRun(clone, packagingFailure);
    }
    try {
        return {
            failed: false,
            inspection: await inspectPackageApplicationProgrammingInterfaces({
                createProject: dependencies.createProject,
                fileManager: dependencies.fileManager,
                nodeModulesFolder: clone.nodeModulesFolder,
                nodeTypeDefinitionsFolder: path.join(dependencies.repositoryFolder, 'node_modules', '@types'),
                runImportProbe: dependencies.runImportProbe
            }),
            resolvedReference: clone.resolvedReference
        };
    } catch (error: unknown) {
        return failedCanaryRun(clone, errorMessage(error));
    }
}

async function packAndInspectBaseline(
    dependencies: CanaryRunnerDependencies,
    clone: PreparedClone,
    verificationFailure: string | undefined
): Promise<PacktoryRunResult> {
    const packagingFailure = await packCanaryClone(dependencies, clone, verificationFailure);
    return await inspectCanaryClone(dependencies, clone, packagingFailure);
}

function compareRuns(
    baseline: PacktoryRunResult,
    candidate: PacktoryRunResult,
    failureContext: string
): readonly CanaryIssue[] {
    if (baseline.failed && candidate.failed) {
        return [
            {
                kind: 'baseline-rot',
                message: `npm baseline failed ${failureContext}:\n${baseline.error}`
            },
            {
                kind: 'baseline-rot',
                message: `source run also failed ${failureContext}:\n${candidate.error}`
            }
        ];
    }
    if (baseline.failed) {
        return [
            {
                kind: 'baseline-rot',
                message: `npm baseline failed ${failureContext}:\n${baseline.error}`
            },
            { kind: 'warning', message: 'source run passed while the npm baseline failed' }
        ];
    }
    if (candidate.failed) {
        return [ {
            kind: 'regression',
            message: [
                `source run failed ${failureContext} after the npm baseline passed:`,
                candidate.error
            ]
                .join('\n')
        } ];
    }
    return compareCanaryApplicationProgrammingInterfaces(baseline.inspection, candidate.inspection).issues;
}

async function compareCanaryClones(
    dependencies: CanaryRunnerDependencies,
    canary: Canary,
    baselineClone: PreparedClone,
    candidateClone: PreparedClone
): Promise<CanaryRunResult> {
    const installations = await Promise.allSettled([
        installCanaryVariant(dependencies, canary, baselineClone),
        installCanaryVariant(dependencies, canary, candidateClone)
    ]);
    const errors = canaryPreparationFailures(installations);
    if (errors.length > 0) {
        throw new AggregateError(errors, errors.map(errorMessage).join('\n'));
    }
    const [ baselineVerificationFailure, candidateVerificationFailure ] = await Promise.all([
        verifyCanaryClone(dependencies, canary, baselineClone),
        verifyCanaryClone(dependencies, canary, candidateClone)
    ]);
    const candidatePackagingFailure = await packCanaryClone(dependencies, candidateClone, candidateVerificationFailure);
    const [ baseline, candidate ] = await Promise.all([
        packAndInspectBaseline(dependencies, baselineClone, baselineVerificationFailure),
        inspectCanaryClone(dependencies, candidateClone, candidatePackagingFailure)
    ]);
    const failureContext = hasPublishCommand(canary)
        ? `while running "${canary.publishCommand}"`
        : 'during package verification';
    return {
        baselineResolvedReference: baseline.resolvedReference,
        candidateResolvedReference: candidate.resolvedReference,
        issues: compareRuns(baseline, candidate, failureContext),
        name: canary.name
    };
}

async function runCanary(
    canary: Canary,
    dependencies: CanaryRunnerDependencies
): Promise<CanaryRunResult> {
    return await withCanaryClone(dependencies, canary.name, 'baseline', async function (baselineFolder) {
        const reference = await prepareCanaryRepository(dependencies, canary, baselineFolder);
        if (!hasPublishCommand(canary)) {
            await dependencies.runCommand(canary.installCommand, baselineFolder);
            try {
                await dependencies.runCommand(canary.buildCommand, baselineFolder);
            } catch (error: unknown) {
                return {
                    baselineResolvedReference: reference,
                    candidateResolvedReference: reference,
                    issues: [ {
                        kind: 'baseline-rot',
                        message: [
                            `Shared downstream build failed while running "${canary.buildCommand}":`,
                            errorMessage(error)
                        ]
                            .join('\n')
                    } ],
                    name: canary.name
                };
            }
        }
        return await withCanaryClone(dependencies, canary.name, 'candidate', async function (candidateFolder) {
            await dependencies.fileManager.copyDirectory(baselineFolder, candidateFolder);
            return await compareCanaryClones(
                dependencies,
                canary,
                preparedClone(baselineFolder, 'baseline', reference),
                preparedClone(candidateFolder, 'candidate', reference)
            );
        });
    });
}

export async function runSelectedCanary(
    manifestPath: string,
    name: string,
    dependencies: CanaryRunnerDependencies
): Promise<CanaryRunResult> {
    const manifest: CanaryManifest = await readCanaryManifest(manifestPath, dependencies.fileManager);
    return await runCanary(selectCanary(manifest, name), dependencies);
}

function shellCommandErrorMessage(input: ShellCommandFailure): string {
    const { signal } = input.error;
    const { killed } = input.error;
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
    timeoutMilliseconds: number,
    execute: CanaryProcessExecutor
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
        execute(
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

export function createShellCommandRunner(timeoutMilliseconds: number, execute: CanaryProcessExecutor): CommandRunner {
    return async function (command, cwd) {
        return runShellCommandWithTimeout(command, cwd, timeoutMilliseconds, execute);
    };
}
