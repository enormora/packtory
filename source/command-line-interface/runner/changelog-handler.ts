import { defaultValidLabels, type PrLogEngine, type PrLogEngineOptions } from '@pr-log/core';
import { normalizeRepositoryUrl } from '../../bundle-emitter/repository-url-normalizer.ts';
import type { FileManager } from '../../file-manager/file-manager.ts';
import { partialFailureMessages } from '../../packtory/partial-result.ts';
import type { Packtory, ReleasePlanPackage, ReleasePlanResult } from '../../packtory/packtory.ts';
import { checksErrorType, configErrorType, type ReleasePlanFailure } from '../../packtory/packtory-results.ts';
import { generateChangelogOutputs } from '../../packtory/packtory-changelog.ts';
import type { ConfigLoader } from '../config-loader.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import {
    generatedAttributionPaths,
    parseValidConfig,
    shouldPageGroupedChangelog,
    writeConfiguredChangelogs
} from './changelog-destinations.ts';

type Logger = (message: string) => void;
type EnvironmentVariableName = 'GH_TOKEN' | 'GITHUB_TOKEN';
type GitHubRepositoryParts = {
    readonly owner: string;
    readonly repo: string;
};
type ValidChangelogConfig = NonNullable<ReturnType<typeof parseValidConfig>>;

export type ChangelogHandlerDeps = {
    readonly createPrLogEngine: (options: Readonly<PrLogEngineOptions>) => PrLogEngine;
    readonly currentDate: () => Date;
    readonly fileManager: Pick<FileManager, 'readFile' | 'writeFile'>;
    readonly log: Logger;
    readonly pageOutput: (content: string) => Promise<void>;
    readonly packtory: Packtory;
    readonly readEnvironmentVariable: (name: EnvironmentVariableName) => string | undefined;
    readonly readPackageInfo: () => Promise<Record<string, unknown>>;
    readonly spinnerRenderer: TerminalSpinnerRenderer;
    readonly configLoader: ConfigLoader;
    readonly workingDirectory: string;
};

const labelLookupIntervalMilliseconds = 250;
const maximumRateLimitRetryCount = 3;
const githubRepositoryPattern = /^https:\/\/github\.com\/(?<owner>[^/]+)\/(?<repo>[^/]+)$/u;

function formatChangelogHandlerError(error: unknown): string {
    return String(error).replace(/^[A-Za-z]*Error: /u, '');
}

function githubTokenFrom(deps: Pick<ChangelogHandlerDeps, 'readEnvironmentVariable'>): string | undefined {
    return deps.readEnvironmentVariable('GH_TOKEN') ?? deps.readEnvironmentVariable('GITHUB_TOKEN');
}

function gitHubRepositoryMatchFrom(repositoryUrl: string | undefined): RegExpExecArray | undefined {
    return githubRepositoryPattern.exec(String(repositoryUrl)) ?? undefined;
}

function gitHubRepositoryPartsFromGroups(
    groups: Record<string, string> | undefined
): GitHubRepositoryParts | undefined {
    if (groups === undefined) {
        return undefined;
    }
    return { owner: String(groups.owner), repo: String(groups.repo) };
}

function gitHubRepositoryPartsFrom(repositoryUrl: string | undefined): GitHubRepositoryParts | undefined {
    return gitHubRepositoryPartsFromGroups(gitHubRepositoryMatchFrom(repositoryUrl)?.groups);
}

function githubRepoFrom(packageInfo: Record<string, unknown>): string {
    const repository = gitHubRepositoryPartsFrom(normalizeRepositoryUrl(packageInfo.repository));
    if (repository === undefined) {
        throw new Error('package.json repository must point to a GitHub repository');
    }
    return `${repository.owner}/${repository.repo}`;
}

function createEngine(deps: ChangelogHandlerDeps): PrLogEngine {
    return deps.createPrLogEngine({
        githubToken: githubTokenFrom(deps),
        workingDirectory: deps.workingDirectory,
        labelLookupIntervalMilliseconds,
        maximumRateLimitRetryCount
    });
}

function printIssueFailure(log: Logger, title: string, issues: readonly string[]): void {
    log(`${title}, there are ${issues.length} issue(s)\n\n- ${issues.join('\n- ')}`);
}

function printReleasePlanFailure(log: Logger, error: ReleasePlanFailure): void {
    if (error.type === configErrorType) {
        printIssueFailure(log, 'Configuration issues', error.issues);
        return;
    }
    if (error.type === checksErrorType) {
        printIssueFailure(log, 'Check issues', error.issues);
        return;
    }
    log(partialFailureMessages(error).join('\n'));
}

function releasePlanPackagesFrom(result: ReleasePlanResult): readonly ReleasePlanPackage[] {
    if (result.isOk) {
        return result.value.packages;
    }
    if ('succeeded' in result.error) {
        return result.error.succeeded;
    }
    return [];
}

async function renderChangelog(
    deps: ChangelogHandlerDeps,
    config: ValidChangelogConfig,
    packages: readonly ReleasePlanPackage[]
): Promise<void> {
    if (packages.length === 0) {
        return;
    }
    const packageInfo = await deps.readPackageInfo();
    const prLogEngine = createEngine(deps);
    const changelog = await generateChangelogOutputs({
        packages,
        prLogEngine,
        githubRepo: githubRepoFrom(packageInfo),
        ignoredAttributionPaths: generatedAttributionPaths(deps, config),
        packageInfo,
        currentDate: deps.currentDate(),
        validLabels: defaultValidLabels
    });
    if (shouldPageGroupedChangelog(config.changelog?.outputs) && changelog.groupedMarkdown.length > 0) {
        await deps.pageOutput(changelog.groupedMarkdown);
    }
    await writeConfiguredChangelogs(deps, config, prLogEngine, changelog);
}

function exitCodeFromReleasePlanResult(log: Logger, result: ReleasePlanResult): number {
    if (result.isOk) {
        return 0;
    }
    printReleasePlanFailure(log, result.error);
    return 1;
}

async function runChangelog(deps: ChangelogHandlerDeps): Promise<number> {
    const config = await deps.configLoader.load();
    const outcome = await deps.packtory.planReleaseAgainstLatestPublished(config);
    deps.spinnerRenderer.stopAll();
    const validConfig = parseValidConfig(config);
    if (validConfig !== undefined) {
        await renderChangelog(deps, validConfig, releasePlanPackagesFrom(outcome.result));
    }
    return exitCodeFromReleasePlanResult(deps.log, outcome.result);
}

function stopSpinnersAndReturn(deps: ChangelogHandlerDeps, exitCode: number): number {
    deps.spinnerRenderer.stopAll();
    return exitCode;
}

export async function runChangelogHandler(deps: ChangelogHandlerDeps): Promise<number> {
    try {
        return stopSpinnersAndReturn(deps, await runChangelog(deps));
    } catch (error: unknown) {
        deps.log(formatChangelogHandlerError(error));
        return stopSpinnersAndReturn(deps, 1);
    }
}
