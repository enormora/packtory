import semver from 'semver';
import type { PrLogConfig, PrLogEngine, PrLogEngineOptions, PullRequestWithLabel } from '@pr-log/core';
import type { VersionProvider } from '../../config/manual-versioning-settings.ts';
import type { PacktoryConfig } from '../../config/config.ts';
import type { VersionSourceResolver } from '../../packtory/map-config.ts';
import { formatGitHubRepositoryName } from '../../command-line-interface/runner/github-repository.ts';
import { createPrLogConfig } from '../../command-line-interface/runner/changelog-pr-log-config.ts';

type EnvironmentVariableName = 'GH_TOKEN' | 'GITHUB_TOKEN';

export type PullRequestLabelVersionSourceDependencies = {
    readonly createPrLogEngine: (options: Readonly<PrLogEngineOptions>) => PrLogEngine;
    readonly readEnvironmentVariable: (name: EnvironmentVariableName) => string | undefined;
    readonly readPackageInfo: () => Promise<Readonly<Record<string, unknown>>>;
    readonly workingDirectory: string;
};

type VersionBumpLevel = keyof PrLogConfig['versionBumps'];

function orderedVersionBumpLevels(): readonly VersionBumpLevel[] {
    return [ 'major', 'minor', 'patch' ];
}

function readGitHubToken(
    dependencies: Pick<PullRequestLabelVersionSourceDependencies, 'readEnvironmentVariable'>
): string | undefined {
    return dependencies.readEnvironmentVariable('GH_TOKEN') ?? dependencies.readEnvironmentVariable('GITHUB_TOKEN');
}

function createEngine(dependencies: PullRequestLabelVersionSourceDependencies, config: PrLogConfig): PrLogEngine {
    return dependencies.createPrLogEngine({
        githubToken: readGitHubToken(dependencies),
        workingDirectory: dependencies.workingDirectory,
        config
    });
}

function selectVersionBumpLevel(
    pullRequests: readonly PullRequestWithLabel[],
    versionBumps: PrLogConfig['versionBumps']
): VersionBumpLevel | undefined {
    const labels = new Set(
        pullRequests.map(function (pullRequest) {
            return pullRequest.label;
        })
    );
    return orderedVersionBumpLevels().find(function (level) {
        return versionBumps[level].some(function (label) {
            return labels.has(label);
        });
    });
}

function incrementVersion(version: string, level: VersionBumpLevel): string {
    const nextVersion = semver.inc(version, level);
    if (nextVersion === null) {
        throw new Error(`Failed to increment version "${version}"`);
    }
    return nextVersion;
}

function selectNextVersion(
    currentVersion: string,
    pullRequests: readonly PullRequestWithLabel[],
    versionBumps: PrLogConfig['versionBumps']
): string {
    const versionBumpLevel = selectVersionBumpLevel(pullRequests, versionBumps);
    return versionBumpLevel === undefined ? currentVersion : incrementVersion(currentVersion, versionBumpLevel);
}

export function createPullRequestLabelVersionSourceResolver(
    dependencies: PullRequestLabelVersionSourceDependencies
): VersionSourceResolver {
    async function collectLabeledPullRequests(
        input: Parameters<VersionProvider>[0],
        packtoryConfig: PacktoryConfig
    ): Promise<readonly PullRequestWithLabel[]> {
        const packageInfo = await dependencies.readPackageInfo();
        const githubRepo = formatGitHubRepositoryName(packageInfo);
        const prLogConfig = createPrLogConfig(packtoryConfig.changelog);
        const prLogEngine = createEngine(dependencies, prLogConfig);
        const baseRef = await prLogEngine.resolveChangelogBaseRef({
            packageName: input.packageName,
            previousVersion: input.currentVersion,
            previousGitHead: undefined,
            packageTagFormat: packtoryConfig.changelog?.packageTagFormat,
            explicitBaseRef: packtoryConfig.changelog?.explicitBaseRef
        });
        const pullRequests = await prLogEngine.collectMergedPullRequests({ githubRepo, baseRef: baseRef.ref });
        const changedFilesByPullRequest = await prLogEngine.readPullRequestChangedFiles({
            githubRepo,
            pullRequests
        });
        const targetPullRequests = prLogEngine.filterPullRequestsByTargetFiles({
            targetName: input.packageName,
            targetSourceFiles: input.targetSourceFiles,
            pullRequests,
            changedFilesByPullRequest,
            ignoredAttributionPaths: input.ignoredAttributionPaths
        });
        return prLogEngine.resolvePullRequestLabels({
            githubRepo,
            config: prLogConfig,
            pullRequests: targetPullRequests,
            targetName: input.packageName,
            targetScopedLabelPattern: packtoryConfig.changelog?.targetScopedLabelPattern
        });
    }

    return function (sourceInput): VersionProvider {
        return async function (input) {
            if (input.currentVersion === undefined) {
                return '0.0.1';
            }
            const prLogConfig = createPrLogConfig(sourceInput.packtoryConfig.changelog);
            return selectNextVersion(
                input.currentVersion,
                await collectLabeledPullRequests(input, sourceInput.packtoryConfig),
                prLogConfig.versionBumps
            );
        };
    };
}
