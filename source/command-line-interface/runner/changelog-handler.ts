import { defaultValidLabels, type PrLogEngine, type PrLogEngineOptions } from '@pr-log/core';
import type { FileManager } from '../../file-manager/file-manager.ts';
import type { Packtory, ReleasePlanPackage, ReleasePlanResult } from '../../packtory/packtory.ts';
import { generateChangelogOutputs } from '../../packtory/packtory-changelog.ts';
import type { ConfigLoader } from '../config-loader.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import {
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

function formatChangelogHandlerError(error: unknown): string {
    return String(error).replace(/^[A-Za-z]*Error: /u, '');
}

function readGitHubToken(deps: Pick<ChangelogHandlerDeps, 'readEnvironmentVariable'>): string | undefined {
    return deps.readEnvironmentVariable('GH_TOKEN') ?? deps.readEnvironmentVariable('GITHUB_TOKEN');
}

function createEngine(deps: ChangelogHandlerDeps): PrLogEngine {
    return deps.createPrLogEngine({
        githubToken: readGitHubToken(deps),
        workingDirectory: deps.workingDirectory,
        labelLookupIntervalMilliseconds,
        maximumRateLimitRetryCount
    });
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
        githubRepo: formatGitHubRepositoryName(packageInfo),
        ignoredAttributionPaths: collectGeneratedAttributionPaths(deps, config),
        packageInfo,
        currentDate: deps.currentDate(),
        validLabels: defaultValidLabels
    });
    if (shouldPageGroupedChangelog(config.changelog?.outputs) && changelog.groupedMarkdown.length > 0) {
        await deps.pageOutput(changelog.groupedMarkdown);
    }
    await writeConfiguredChangelogs(deps, config, prLogEngine, changelog);
}

function resolveReleasePlanExitCode(log: Logger, result: ReleasePlanResult): number {
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
        await renderChangelog(deps, validConfig, collectReleasePlanPackages(outcome.result));
    }
    return resolveReleasePlanExitCode(deps.log, outcome.result);
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
