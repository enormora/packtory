import type {
    PullRequestLogConfiguration,
    PullRequestLogEngine,
    PullRequestLogEngineOptions
} from '../../changelog/pull-request-log.ts';
import type { FileManager } from '../../file-manager/file-manager.ts';
import type { Packtory, ReleasePlanPackage, ReleasePlanResult } from '../../packtory/packtory.ts';
import { generateChangelogOutputs } from '../../packtory/packtory-changelog.ts';
import type { ConfigurationLoader } from '../configuration-loader.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import {
    createChangelogGenerationOptions,
    collectChangelogSourceFileRoots,
    collectGeneratedAttributionPaths,
    parseValidConfiguration,
    shouldPageGroupedChangelog,
    writeConfiguredChangelogs
} from './changelog-destinations.ts';
import { formatGitHubRepositoryName } from './github-repository.ts';
import { printReleasePlanFailure, collectReleasePlanPackages } from './release-plan-result-printing.ts';
import { formatTerminalError, formatTerminalErrorTrace } from './terminal-error-chain.ts';

type Logger = (message: string) => void;
type EnvironmentVariableName = 'GH_TOKEN' | 'GITHUB_TOKEN';
type ValidChangelogConfiguration = NonNullable<ReturnType<typeof parseValidConfiguration>>;

export type ChangelogHandlerDependencies = {
    readonly createPullRequestLogEngine: (options: Readonly<PullRequestLogEngineOptions>) => PullRequestLogEngine;
    readonly currentDate: () => Date;
    readonly fileManager: Pick<FileManager, 'readFile' | 'writeFile'>;
    readonly log: Logger;
    readonly pageOutput: (content: string) => Promise<void>;
    readonly packtory: Packtory;
    readonly readEnvironmentVariable: (name: EnvironmentVariableName) => string | undefined;
    readonly readPackageInformation: () => Promise<Readonly<Record<string, unknown>>>;
    readonly spinnerRenderer: TerminalSpinnerRenderer;
    readonly configurationLoader: ConfigurationLoader;
    readonly trace: boolean;
    readonly workingDirectory: string;
};

function toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

function formatChangelogHandlerError(error: unknown): string {
    return formatTerminalError(toError(error));
}

function formatChangelogHandlerTrace(error: unknown): string {
    return formatTerminalErrorTrace(toError(error));
}

function readGitHubToken(
    dependencies: Pick<ChangelogHandlerDependencies, 'readEnvironmentVariable'>
): string | undefined {
    return dependencies.readEnvironmentVariable('GH_TOKEN') ?? dependencies.readEnvironmentVariable('GITHUB_TOKEN');
}

function createEngine(
    dependencies: ChangelogHandlerDependencies,
    configuration: PullRequestLogConfiguration
): PullRequestLogEngine {
    return dependencies.createPullRequestLogEngine({
        githubToken: readGitHubToken(dependencies),
        workingDirectory: dependencies.workingDirectory,
        configuration
    });
}

async function renderChangelog(
    dependencies: ChangelogHandlerDependencies,
    configuration: ValidChangelogConfiguration,
    packages: readonly ReleasePlanPackage[]
): Promise<void> {
    if (packages.length === 0) {
        return;
    }
    const packageInformation = await dependencies.readPackageInformation();
    const generationOptions = createChangelogGenerationOptions(configuration);
    const pullRequestLogEngine = createEngine(dependencies, generationOptions.pullRequestLogConfiguration);
    const changelog = await generateChangelogOutputs({
        packages,
        pullRequestLogEngine,
        changelogSourceFileRootsByPackageName: collectChangelogSourceFileRoots(dependencies, configuration),
        explicitBaseReference: generationOptions.explicitBaseReference,
        githubRepository: formatGitHubRepositoryName(packageInformation),
        ignoredAttributionPaths: collectGeneratedAttributionPaths(dependencies, configuration),
        packageTagFormat: generationOptions.packageTagFormat,
        currentDate: dependencies.currentDate(),
        pullRequestLogConfiguration: generationOptions.pullRequestLogConfiguration,
        targetScopedLabelPattern: generationOptions.targetScopedLabelPattern
    });
    if (shouldPageGroupedChangelog(configuration.changelog?.outputs) && changelog.groupedMarkdown.length > 0) {
        await dependencies.pageOutput(changelog.groupedMarkdown);
    }
    await writeConfiguredChangelogs(dependencies, configuration, pullRequestLogEngine, changelog);
}

function resolveReleasePlanExitCode(log: Logger, result: ReleasePlanResult, trace: boolean): number {
    if (result.isOk) {
        return 0;
    }
    printReleasePlanFailure(log, result.error, trace);
    return 1;
}

async function runChangelog(dependencies: ChangelogHandlerDependencies): Promise<number> {
    const configuration = await dependencies.configurationLoader.load();
    const outcome = await dependencies.packtory.planReleaseAgainstLatestPublished(configuration);
    dependencies.spinnerRenderer.stopAll();
    const validConfiguration = parseValidConfiguration(configuration);
    if (validConfiguration !== undefined) {
        await renderChangelog(dependencies, validConfiguration, collectReleasePlanPackages(outcome.result));
    }
    return resolveReleasePlanExitCode(dependencies.log, outcome.result, dependencies.trace);
}

function stopSpinnersAndReturn(dependencies: ChangelogHandlerDependencies, exitCode: number): number {
    dependencies.spinnerRenderer.stopAll();
    return exitCode;
}

export async function runChangelogHandler(dependencies: ChangelogHandlerDependencies): Promise<number> {
    try {
        return stopSpinnersAndReturn(dependencies, await runChangelog(dependencies));
    } catch (error: unknown) {
        const formatError = dependencies.trace ? formatChangelogHandlerTrace : formatChangelogHandlerError;
        dependencies.log(formatError(error));
        return stopSpinnersAndReturn(dependencies, 1);
    }
}
