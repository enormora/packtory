import type { PrLogConfig, PrLogEngine, PrLogEngineOptions } from '@pr-log/core';
import type { FileManager } from '../../file-manager/file-manager.ts';
import type { Packtory, ReleasePlanPackage, ReleasePlanResult } from '../../packtory/packtory.ts';
import { generateChangelogOutputs } from '../../packtory/packtory-changelog.ts';
import type { ConfigLoader } from '../config-loader.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import {
    createChangelogGenerationOptions,
    collectChangelogSourceFileRoots,
    collectGeneratedAttributionPaths,
    parseValidConfig,
    shouldPageGroupedChangelog,
    writeConfiguredChangelogs
} from './changelog-destinations.ts';
import { formatGitHubRepositoryName } from './github-repository.ts';
import { printReleasePlanFailure, collectReleasePlanPackages } from './release-plan-result-printing.ts';

type Logger = (message: string) => void;
type EnvironmentVariableName = 'GH_TOKEN' | 'GITHUB_TOKEN';
type ValidChangelogConfig = NonNullable<ReturnType<typeof parseValidConfig>>;

export type ChangelogHandlerDependencies = {
    readonly createPrLogEngine: (options: Readonly<PrLogEngineOptions>) => PrLogEngine;
    readonly currentDate: () => Date;
    readonly fileManager: Pick<FileManager, 'readFile' | 'writeFile'>;
    readonly log: Logger;
    readonly pageOutput: (content: string) => Promise<void>;
    readonly packtory: Packtory;
    readonly readEnvironmentVariable: (name: EnvironmentVariableName) => string | undefined;
    readonly readPackageInfo: () => Promise<Readonly<Record<string, unknown>>>;
    readonly spinnerRenderer: TerminalSpinnerRenderer;
    readonly configLoader: ConfigLoader;
    readonly workingDirectory: string;
};

function formatChangelogHandlerError(error: unknown): string {
    return String(error).replace(/^[A-Za-z]*Error: /u, '');
}

function readGitHubToken(
    dependencies: Pick<ChangelogHandlerDependencies, 'readEnvironmentVariable'>
): string | undefined {
    return dependencies.readEnvironmentVariable('GH_TOKEN') ?? dependencies.readEnvironmentVariable('GITHUB_TOKEN');
}

function createEngine(dependencies: ChangelogHandlerDependencies, config: PrLogConfig): PrLogEngine {
    return dependencies.createPrLogEngine({
        githubToken: readGitHubToken(dependencies),
        workingDirectory: dependencies.workingDirectory,
        config
    });
}

async function renderChangelog(
    dependencies: ChangelogHandlerDependencies,
    config: ValidChangelogConfig,
    packages: readonly ReleasePlanPackage[]
): Promise<void> {
    if (packages.length === 0) {
        return;
    }
    const packageInfo = await dependencies.readPackageInfo();
    const generationOptions = createChangelogGenerationOptions(config);
    const prLogEngine = createEngine(dependencies, generationOptions.prLogConfig);
    const changelog = await generateChangelogOutputs({
        packages,
        prLogEngine,
        changelogSourceFileRootsByPackageName: collectChangelogSourceFileRoots(dependencies, config),
        explicitBaseRef: generationOptions.explicitBaseRef,
        githubRepo: formatGitHubRepositoryName(packageInfo),
        ignoredAttributionPaths: collectGeneratedAttributionPaths(dependencies, config),
        packageTagFormat: generationOptions.packageTagFormat,
        currentDate: dependencies.currentDate(),
        prLogConfig: generationOptions.prLogConfig,
        targetScopedLabelPattern: generationOptions.targetScopedLabelPattern
    });
    if (shouldPageGroupedChangelog(config.changelog?.outputs) && changelog.groupedMarkdown.length > 0) {
        await dependencies.pageOutput(changelog.groupedMarkdown);
    }
    await writeConfiguredChangelogs(dependencies, config, prLogEngine, changelog);
}

function resolveReleasePlanExitCode(log: Logger, result: ReleasePlanResult): number {
    if (result.isOk) {
        return 0;
    }
    printReleasePlanFailure(log, result.error);
    return 1;
}

async function runChangelog(dependencies: ChangelogHandlerDependencies): Promise<number> {
    const config = await dependencies.configLoader.load();
    const outcome = await dependencies.packtory.planReleaseAgainstLatestPublished(config);
    dependencies.spinnerRenderer.stopAll();
    const validConfig = parseValidConfig(config);
    if (validConfig !== undefined) {
        await renderChangelog(dependencies, validConfig, collectReleasePlanPackages(outcome.result));
    }
    return resolveReleasePlanExitCode(dependencies.log, outcome.result);
}

function stopSpinnersAndReturn(dependencies: ChangelogHandlerDependencies, exitCode: number): number {
    dependencies.spinnerRenderer.stopAll();
    return exitCode;
}

export async function runChangelogHandler(dependencies: ChangelogHandlerDependencies): Promise<number> {
    try {
        return stopSpinnersAndReturn(dependencies, await runChangelog(dependencies));
    } catch (error: unknown) {
        dependencies.log(formatChangelogHandlerError(error));
        return stopSpinnersAndReturn(dependencies, 1);
    }
}
