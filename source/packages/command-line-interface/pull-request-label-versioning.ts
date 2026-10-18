import semver from 'semver';
import type {
    PullRequestLogConfiguration,
    PullRequestWithLabel,
    PullRequestLogEngine,
    PullRequestLogEngineOptions
} from '../../changelog/pull-request-log.ts';
import type { VersionProvider } from '../../configuration/manual-versioning-settings.ts';
import type { PacktoryConfiguration } from '../../configuration/configuration.ts';
import type { VersionSourceResolver } from '../../packtory/map-configuration.ts';
import { formatGitHubRepositoryName } from '../../command-line-interface/runner/github-repository.ts';
import * as changelog from '../../command-line-interface/runner/changelog-pull-request-log-configuration.ts';

type EnvironmentVariableName = 'GH_TOKEN' | 'GITHUB_TOKEN';

export type PullRequestLabelVersionSourceDependencies = {
    readonly createPullRequestLogEngine: (options: Readonly<PullRequestLogEngineOptions>) => PullRequestLogEngine;
    readonly readEnvironmentVariable: (name: EnvironmentVariableName) => string | undefined;
    readonly readPackageInformation: () => Promise<Readonly<Record<string, unknown>>>;
    readonly workingDirectory: string;
};

type VersionBumpLevel = keyof PullRequestLogConfiguration['versionBumps'];

function orderedVersionBumpLevels(): readonly VersionBumpLevel[] {
    return [ 'major', 'minor', 'patch' ];
}

function readGitHubToken(
    dependencies: Pick<PullRequestLabelVersionSourceDependencies, 'readEnvironmentVariable'>
): string | undefined {
    return dependencies.readEnvironmentVariable('GH_TOKEN') ?? dependencies.readEnvironmentVariable('GITHUB_TOKEN');
}

function createEngine(
    dependencies: PullRequestLabelVersionSourceDependencies,
    configuration: PullRequestLogConfiguration
): PullRequestLogEngine {
    return dependencies.createPullRequestLogEngine({
        githubToken: readGitHubToken(dependencies),
        workingDirectory: dependencies.workingDirectory,
        configuration
    });
}

function selectVersionBumpLevel(
    pullRequests: readonly PullRequestWithLabel[],
    versionBumps: PullRequestLogConfiguration['versionBumps']
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
    versionBumps: PullRequestLogConfiguration['versionBumps']
): string {
    const versionBumpLevel = selectVersionBumpLevel(pullRequests, versionBumps);
    return versionBumpLevel === undefined ? currentVersion : incrementVersion(currentVersion, versionBumpLevel);
}

export function createPullRequestLabelVersionSourceResolver(
    dependencies: PullRequestLabelVersionSourceDependencies
): VersionSourceResolver {
    async function collectLabeledPullRequests(
        input: Parameters<VersionProvider>[0],
        packtoryConfiguration: PacktoryConfiguration
    ): Promise<readonly PullRequestWithLabel[]> {
        const packageInformation = await dependencies.readPackageInformation();
        const githubRepository = formatGitHubRepositoryName(packageInformation);
        const pullRequestLogConfiguration = changelog.createPullRequestLogConfiguration(
            packtoryConfiguration.changelog
        );
        const pullRequestLogEngine = createEngine(dependencies, pullRequestLogConfiguration);
        const baseReference = await pullRequestLogEngine.resolveChangelogBaseReference({
            packageName: input.packageName,
            previousVersion: input.currentVersion,
            previousGitHead: undefined,
            packageTagFormat: packtoryConfiguration.changelog?.packageTagFormat,
            explicitBaseReference: packtoryConfiguration.changelog?.explicitBaseReference
        });
        const pullRequests = await pullRequestLogEngine.collectMergedPullRequests({
            githubRepository,
            baseReference: baseReference.reference
        });
        const changedFilesByPullRequest = await pullRequestLogEngine.readPullRequestChangedFiles({
            githubRepository,
            pullRequests
        });
        const targetPullRequests = pullRequestLogEngine.filterPullRequestsByTargetFiles({
            targetName: input.packageName,
            targetSourceFiles: input.targetSourceFiles,
            pullRequests,
            changedFilesByPullRequest,
            ignoredAttributionPaths: input.ignoredAttributionPaths
        });
        return pullRequestLogEngine.resolvePullRequestLabels({
            githubRepository,
            configuration: pullRequestLogConfiguration,
            pullRequests: targetPullRequests,
            targetName: input.packageName,
            targetScopedLabelPattern: packtoryConfiguration.changelog?.targetScopedLabelPattern
        });
    }

    return function (sourceInput): VersionProvider {
        return async function (input) {
            if (input.currentVersion === undefined) {
                return '0.0.1';
            }
            const pullRequestLogConfiguration = changelog.createPullRequestLogConfiguration(
                sourceInput.packtoryConfiguration.changelog
            );
            return selectNextVersion(
                input.currentVersion,
                await collectLabeledPullRequests(input, sourceInput.packtoryConfiguration),
                pullRequestLogConfiguration.versionBumps
            );
        };
    };
}
