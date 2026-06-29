import semver from 'semver';
import { defaultValidLabels, type PrLogEngine, type PrLogEngineOptions, type PullRequestWithLabel } from '@pr-log/core';
import type { VersionProvider } from '../../config/manual-versioning-settings.ts';
import type { PacktoryConfig } from '../../config/config.ts';
import type { VersionSourceResolver } from '../../packtory/map-config.ts';
import { formatGitHubRepositoryName } from '../../command-line-interface/runner/github-repository.ts';

type EnvironmentVariableName = 'GH_TOKEN' | 'GITHUB_TOKEN';

export type PullRequestLabelVersionSourceDeps = {
    readonly createPrLogEngine: (options: Readonly<PrLogEngineOptions>) => PrLogEngine;
    readonly readEnvironmentVariable: (name: EnvironmentVariableName) => string | undefined;
    readonly readPackageInfo: () => Promise<Readonly<Record<string, unknown>>>;
    readonly workingDirectory: string;
};

type VersionBumpLevel = 'major' | 'minor' | 'patch';

const orderedVersionBumpLevels: readonly VersionBumpLevel[] = [ 'major', 'minor', 'patch' ];
const labelLookupIntervalMilliseconds = 250;
const maximumRateLimitRetryCount = 3;

function readGitHubToken(deps: Pick<PullRequestLabelVersionSourceDeps, 'readEnvironmentVariable'>): string | undefined {
    return deps.readEnvironmentVariable('GH_TOKEN') ?? deps.readEnvironmentVariable('GITHUB_TOKEN');
}

function createEngine(deps: PullRequestLabelVersionSourceDeps): PrLogEngine {
    return deps.createPrLogEngine({
        githubToken: readGitHubToken(deps),
        workingDirectory: deps.workingDirectory,
        labelLookupIntervalMilliseconds,
        maximumRateLimitRetryCount
    });
}

function createValidLabels(config: PacktoryConfig): ReadonlyMap<string, string> {
    return new Map([ ...defaultValidLabels, ...Object.entries(config.changelog?.labels ?? {}) ]);
}

function createVersionBumpLabels(
    validLabels: ReadonlyMap<string, string>
): Readonly<Record<VersionBumpLevel, readonly string[]>> {
    const allLabels = Array.from(validLabels.keys());
    return {
        major: [ 'breaking' ],
        minor: [ 'feature' ],
        patch: allLabels
    };
}

function selectVersionBumpLevel(
    pullRequests: readonly PullRequestWithLabel[],
    validLabels: ReadonlyMap<string, string>
): VersionBumpLevel | undefined {
    const labels = new Set(
        pullRequests.map(function (pullRequest) {
            return pullRequest.label;
        })
    );
    const versionBumpLabels = createVersionBumpLabels(validLabels);
    return orderedVersionBumpLevels.find(function (level) {
        return versionBumpLabels[level].some(function (label) {
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
    validLabels: ReadonlyMap<string, string>
): string {
    const versionBumpLevel = selectVersionBumpLevel(pullRequests, validLabels);
    return versionBumpLevel === undefined ? currentVersion : incrementVersion(currentVersion, versionBumpLevel);
}

export function createPullRequestLabelVersionSourceResolver(
    deps: PullRequestLabelVersionSourceDeps
): VersionSourceResolver {
    async function collectLabeledPullRequests(
        input: Parameters<VersionProvider>[0],
        packtoryConfig: PacktoryConfig
    ): Promise<readonly PullRequestWithLabel[]> {
        const packageInfo = await deps.readPackageInfo();
        const githubRepo = formatGitHubRepositoryName(packageInfo);
        const validLabels = createValidLabels(packtoryConfig);
        const prLogEngine = createEngine(deps);
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
            validLabels,
            ignoredLabels: [],
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
            return selectNextVersion(
                input.currentVersion,
                await collectLabeledPullRequests(input, sourceInput.packtoryConfig),
                createValidLabels(sourceInput.packtoryConfig)
            );
        };
    };
}
