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

async function writePacktoryShim(
    dependencies: CanaryRunnerDependencies,
    cloneFolder: string,
    mode: PacktoryMode
): Promise<void> {
    const shimPath = packtoryBinPath(cloneFolder);
    const packtoryCommand = mode === 'baseline'
        ? 'npm exec --yes --package @packtory/cli@latest -- packtory'
        : `${JSON.stringify(process.execPath)} --experimental-strip-types --enable-source-maps ${
            JSON.stringify(path.join(
                dependencies.repositoryFolder,
                'source/packages/command-line-interface/command-line-interface.entry-point.ts'
            ))
        }`;
    const content = shellScript(`exec ${packtoryCommand} "$@"`);
    await dependencies.fileManager.writeFile(shimPath, content);
    await dependencies.fileManager.setExecutable(shimPath, true);
}

async function cloneRepository(
    dependencies: CanaryRunnerDependencies,
    canary: Canary,
    mode: PacktoryMode
): Promise<PreparedClone> {
    const cloneFolder = await dependencies.createTemporaryFolder(`packtory-canary-${canary.name}-${mode}-`);
    await dependencies.runCommand(
        `git clone --depth 1 --branch ${JSON.stringify(canary.ref)} ${JSON.stringify(canary.repository)} .`,
        cloneFolder
    );
    await dependencies.runCommand('git fetch --tags --force', cloneFolder);
    const revParseResult = await dependencies.runCommand('git rev-parse HEAD', cloneFolder);
    const resolvedRef = revParseResult.stdout.trim();
    await dependencies.runCommand(canary.installCommand, cloneFolder);
    await writeCanaryConfigOverlay({ cloneFolder, fileManager: dependencies.fileManager });
    await writePacktoryShim(dependencies, cloneFolder, mode);
    return {
        cloneFolder,
        nodeModulesFolder: path.join(cloneFolder, packOutputFolderName, 'node_modules'),
        resolvedRef
    };
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
    mode: PacktoryMode
): Promise<PacktoryRunResult> {
    const clone = await cloneRepository(dependencies, canary, mode);
    try {
        await dependencies.runCommand(canary.publishCommand, clone.cloneFolder);
        await packGeneratedPackages(dependencies, clone);
        return {
            failed: false,
            inspection: await inspectPackageApis({
                fileManager: dependencies.fileManager,
                nodeModulesFolder: clone.nodeModulesFolder,
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
    const [ baseline, candidate ] = await Promise.all([
        runPacktoryInClone(dependencies, canary, 'baseline'),
        runPacktoryInClone(dependencies, canary, 'candidate')
    ]);
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

export async function runShellCommand(
    command: string,
    cwd: string
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
            { cwd, encoding: 'utf8' },
            function (error, stdout, stderr) {
                if (error === null) {
                    resolve({ stdout, stderr });
                    return;
                }
                reject(new Error([ stdout.trim(), stderr.trim(), error.message ].filter(Boolean).join('\n')));
            }
        );
    });
}
