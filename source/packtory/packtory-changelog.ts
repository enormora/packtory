import path from 'node:path';
import type { PrLogEngine, PullRequest, PullRequestWithLabel, TargetChangelogSection } from '@pr-log/core';
import { compareValues } from '../common/sort-values.ts';
import { releaseAnalysisClassification, type ReleasePlanPackage } from './packtory-results.ts';
import { isPackageManifestInputPath } from './changelog-source-attribution.ts';

type ChangelogTarget = {
    readonly packagePlan: ReleasePlanPackage;
    readonly pullRequests: readonly PullRequestWithLabel[];
};

const dependencyUpdateLabel = 'upgrade';
const dependencyUpdateTitle = 'Update dependencies';

export type GenerateChangelogInput = {
    readonly currentDate: Date;
    readonly explicitBaseRef: string | undefined;
    readonly githubRepo: string;
    readonly ignoredAttributionPaths: readonly string[];
    readonly packageInfo: Record<string, unknown>;
    readonly packages: readonly ReleasePlanPackage[];
    readonly packageTagFormat: string | undefined;
    readonly prLogEngine: Pick<
        PrLogEngine,
        | 'collectMergedPullRequests'
        | 'filterPullRequestsByTargetFiles'
        | 'readPullRequestChangedFiles'
        | 'renderGroupedTargetChangelog'
        | 'renderTargetChangelog'
        | 'resolveChangelogBaseRef'
        | 'resolveLatestSemverChangelogBaseRef'
        | 'resolvePullRequestLabels'
    >;
    readonly targetScopedLabelPattern: string | undefined;
    readonly validLabels: ReadonlyMap<string, string>;
};

export type GeneratedChangelog = {
    readonly groupedMarkdown: string;
    readonly packageNamesWithoutChangelogEntries: readonly string[];
    readonly packageMarkdownByName: ReadonlyMap<string, string>;
};

function selectChangedPackages(packages: readonly ReleasePlanPackage[]): readonly ReleasePlanPackage[] {
    return packages.filter((packagePlan) => {
        return packagePlan.changed;
    });
}

function sortUniqueValues(values: ReadonlySet<string>): readonly string[] {
    return Array.from(values).toSorted(compareValues);
}

function isChangelogFilePath(filePath: string): boolean {
    return path.posix.basename(filePath) === 'CHANGELOG.md';
}

function collectChangelogPaths(packages: readonly ReleasePlanPackage[]): readonly string[] {
    return sortUniqueValues(
        new Set(
            packages.flatMap((packagePlan) => {
                return packagePlan.changelogSourceFiles.filter(isChangelogFilePath);
            })
        )
    );
}

function mergeIgnoredAttributionPaths(
    packages: readonly ReleasePlanPackage[],
    configuredPaths: readonly string[]
): readonly string[] {
    return sortUniqueValues(new Set([...collectChangelogPaths(packages), ...configuredPaths]));
}

function pullRequestTitleMentionsDependency(pullRequest: PullRequest, dependencyName: string): boolean {
    return pullRequest.title.toLowerCase().includes(dependencyName.toLowerCase());
}

function selectManifestDependencyPullRequests(
    packagePlan: ReleasePlanPackage,
    pullRequests: readonly PullRequest[],
    changedFilesByPullRequest: ReadonlyMap<number, readonly string[]>
): readonly PullRequest[] {
    return pullRequests.filter((pullRequest) => {
        const changedFiles = changedFilesByPullRequest.get(pullRequest.id);
        return (
            changedFiles !== undefined &&
            changedFiles.some(isPackageManifestInputPath) &&
            packagePlan.changelogDependencyNames.some((dependencyName) => {
                return pullRequestTitleMentionsDependency(pullRequest, dependencyName);
            })
        );
    });
}

function mergePullRequests(pullRequests: readonly PullRequest[]): readonly PullRequest[] {
    return Array.from(
        new Map(
            pullRequests.map((pullRequest) => {
                return [pullRequest.id, pullRequest] as const;
            })
        ).values()
    );
}

async function resolveBaseRefFor(
    prLogEngine: GenerateChangelogInput['prLogEngine'],
    packagePlan: ReleasePlanPackage,
    input: Pick<GenerateChangelogInput, 'explicitBaseRef' | 'packageTagFormat'>
): Promise<string> {
    if (
        input.explicitBaseRef === undefined &&
        packagePlan.previousVersion === undefined &&
        packagePlan.previousGitHead === undefined
    ) {
        const baseRef = await prLogEngine.resolveLatestSemverChangelogBaseRef();
        return baseRef.ref;
    }

    const baseRef = await prLogEngine.resolveChangelogBaseRef({
        packageName: packagePlan.name,
        previousVersion: packagePlan.previousVersion,
        previousGitHead: packagePlan.previousGitHead,
        packageTagFormat: input.packageTagFormat,
        explicitBaseRef: input.explicitBaseRef
    });
    return baseRef.ref;
}

async function collectTargetPullRequests(
    input: GenerateChangelogInput,
    packagePlan: ReleasePlanPackage,
    ignoredAttributionPaths: readonly string[]
): Promise<readonly PullRequestWithLabel[]> {
    const baseRef = await resolveBaseRefFor(input.prLogEngine, packagePlan, input);
    const pullRequests = await input.prLogEngine.collectMergedPullRequests({
        githubRepo: input.githubRepo,
        baseRef
    });
    const changedFilesByPullRequest = await input.prLogEngine.readPullRequestChangedFiles({
        githubRepo: input.githubRepo,
        pullRequests
    });
    const packagePullRequests = input.prLogEngine.filterPullRequestsByTargetFiles({
        targetName: packagePlan.name,
        targetSourceFiles: packagePlan.changelogSourceFiles,
        pullRequests,
        changedFilesByPullRequest,
        ignoredAttributionPaths
    });
    const dependencyPullRequests = selectManifestDependencyPullRequests(
        packagePlan,
        pullRequests,
        changedFilesByPullRequest
    );

    return input.prLogEngine.resolvePullRequestLabels({
        githubRepo: input.githubRepo,
        validLabels: input.validLabels,
        ignoredLabels: [],
        pullRequests: mergePullRequests([...packagePullRequests, ...dependencyPullRequests]),
        targetName: packagePlan.name,
        targetScopedLabelPattern: input.targetScopedLabelPattern
    });
}

async function createChangelogTarget(
    input: GenerateChangelogInput,
    packagePlan: ReleasePlanPackage,
    ignoredAttributionPaths: readonly string[]
): Promise<ChangelogTarget> {
    return {
        packagePlan,
        pullRequests: await collectTargetPullRequests(input, packagePlan, ignoredAttributionPaths)
    };
}

function changelogPullRequestsFor(target: ChangelogTarget): readonly PullRequestWithLabel[] {
    if (target.packagePlan.releaseClassification !== releaseAnalysisClassification.dependencyOnly) {
        return target.pullRequests;
    }

    return target.pullRequests.map((pullRequest) => {
        return { ...pullRequest, title: dependencyUpdateTitle, label: dependencyUpdateLabel };
    });
}

function changelogLabelsForRendering(validLabels: ReadonlyMap<string, string>): ReadonlyMap<string, string> {
    if (validLabels.has(dependencyUpdateLabel)) {
        return validLabels;
    }
    return new Map([...validLabels, [dependencyUpdateLabel, 'Dependency Upgrades']]);
}

function createTargetSection(target: ChangelogTarget): TargetChangelogSection {
    return {
        targetName: target.packagePlan.name,
        unreleased: false,
        versionNumber: target.packagePlan.nextVersion,
        mergedPullRequests: changelogPullRequestsFor(target)
    };
}

function hasChangelogEntries(target: ChangelogTarget): boolean {
    return target.pullRequests.length > 0;
}

function createPackageMarkdownByName(
    input: GenerateChangelogInput,
    targets: readonly ChangelogTarget[]
): ReadonlyMap<string, string> {
    const validLabels = changelogLabelsForRendering(input.validLabels);
    return new Map(
        targets.filter(hasChangelogEntries).map((target) => {
            const targetSection = createTargetSection(target);
            return [
                target.packagePlan.name,
                input.prLogEngine.renderTargetChangelog({
                    packageInfo: input.packageInfo,
                    currentDate: input.currentDate,
                    validLabels,
                    githubRepo: input.githubRepo,
                    ...targetSection
                })
            ] as const;
        })
    );
}

export async function generateChangelogOutputs(input: GenerateChangelogInput): Promise<GeneratedChangelog> {
    const packages = selectChangedPackages(input.packages);
    const ignoredAttributionPaths = mergeIgnoredAttributionPaths(packages, input.ignoredAttributionPaths);
    const validLabels = changelogLabelsForRendering(input.validLabels);
    const targets = await Promise.all(
        packages.map(async (packagePlan) => {
            return createChangelogTarget(input, packagePlan, ignoredAttributionPaths);
        })
    );
    const targetsWithEntries = targets.filter(hasChangelogEntries);

    return {
        groupedMarkdown: input.prLogEngine.renderGroupedTargetChangelog({
            packageInfo: input.packageInfo,
            currentDate: input.currentDate,
            validLabels,
            githubRepo: input.githubRepo,
            targets: targetsWithEntries.map(createTargetSection)
        }),
        packageNamesWithoutChangelogEntries: targets
            .filter((target) => {
                return !hasChangelogEntries(target);
            })
            .map((target) => {
                return target.packagePlan.name;
            }),
        packageMarkdownByName: createPackageMarkdownByName(input, targets)
    };
}
