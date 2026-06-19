import type { PrLogEngine, PullRequestWithLabel, TargetChangelogSection } from '@pr-log/core';
import { compareValues } from '../common/sort-values.ts';
import type { ReleasePlanPackage } from './packtory-results.ts';

type ChangelogTarget = {
    readonly packagePlan: ReleasePlanPackage;
    readonly pullRequests: readonly PullRequestWithLabel[];
};

export type GenerateChangelogInput = {
    readonly currentDate: Date;
    readonly githubRepo: string;
    readonly ignoredAttributionPaths: readonly string[];
    readonly packageInfo: Record<string, unknown>;
    readonly packages: readonly ReleasePlanPackage[];
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
    readonly validLabels: ReadonlyMap<string, string>;
};

export type GeneratedChangelog = {
    readonly groupedMarkdown: string;
    readonly packageMarkdownByName: ReadonlyMap<string, string>;
};

const changelogFileName = 'CHANGELOG.md';
const changelogFileSuffix = `/${changelogFileName}`;

function changedPackagesFrom(packages: readonly ReleasePlanPackage[]): readonly ReleasePlanPackage[] {
    return packages.filter((packagePlan) => {
        return packagePlan.changed;
    });
}

function sortedUnique(values: ReadonlySet<string>): readonly string[] {
    return Array.from(values).toSorted(compareValues);
}

function changelogPathsFrom(packages: readonly ReleasePlanPackage[]): readonly string[] {
    return sortedUnique(
        new Set(
            packages.flatMap((packagePlan) => {
                return packagePlan.changelogSourceFiles.filter((filePath) => {
                    return filePath === changelogFileName || filePath.endsWith(changelogFileSuffix);
                });
            })
        )
    );
}

function mergedIgnoredAttributionPaths(
    packages: readonly ReleasePlanPackage[],
    configuredPaths: readonly string[]
): readonly string[] {
    return sortedUnique(new Set([...changelogPathsFrom(packages), ...configuredPaths]));
}

async function baseRefFor(
    prLogEngine: GenerateChangelogInput['prLogEngine'],
    packagePlan: ReleasePlanPackage
): Promise<string> {
    if (packagePlan.previousVersion === undefined && packagePlan.previousGitHead === undefined) {
        const baseRef = await prLogEngine.resolveLatestSemverChangelogBaseRef();
        return baseRef.ref;
    }

    const baseRef = await prLogEngine.resolveChangelogBaseRef({
        packageName: packagePlan.name,
        previousVersion: packagePlan.previousVersion,
        previousGitHead: packagePlan.previousGitHead,
        packageTagFormat: undefined,
        explicitBaseRef: undefined
    });
    return baseRef.ref;
}

async function targetPullRequestsFor(
    input: GenerateChangelogInput,
    packagePlan: ReleasePlanPackage,
    ignoredAttributionPaths: readonly string[]
): Promise<readonly PullRequestWithLabel[]> {
    const baseRef = await baseRefFor(input.prLogEngine, packagePlan);
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

    return input.prLogEngine.resolvePullRequestLabels({
        githubRepo: input.githubRepo,
        validLabels: input.validLabels,
        ignoredLabels: [],
        pullRequests: packagePullRequests,
        targetName: packagePlan.name,
        targetScopedLabelPattern: undefined
    });
}

async function changelogTargetFor(
    input: GenerateChangelogInput,
    packagePlan: ReleasePlanPackage,
    ignoredAttributionPaths: readonly string[]
): Promise<ChangelogTarget> {
    return {
        packagePlan,
        pullRequests: await targetPullRequestsFor(input, packagePlan, ignoredAttributionPaths)
    };
}

function targetSectionFrom(target: ChangelogTarget): TargetChangelogSection {
    return {
        targetName: target.packagePlan.name,
        unreleased: false,
        versionNumber: target.packagePlan.nextVersion,
        mergedPullRequests: target.pullRequests
    };
}

function packageMarkdownByNameFrom(
    input: GenerateChangelogInput,
    targets: readonly ChangelogTarget[]
): ReadonlyMap<string, string> {
    return new Map(
        targets.map((target) => {
            const targetSection = targetSectionFrom(target);
            return [
                target.packagePlan.name,
                input.prLogEngine.renderTargetChangelog({
                    packageInfo: input.packageInfo,
                    currentDate: input.currentDate,
                    validLabels: input.validLabels,
                    githubRepo: input.githubRepo,
                    ...targetSection
                })
            ] as const;
        })
    );
}

export async function generateChangelogOutputs(input: GenerateChangelogInput): Promise<GeneratedChangelog> {
    const packages = changedPackagesFrom(input.packages);
    const ignoredAttributionPaths = mergedIgnoredAttributionPaths(packages, input.ignoredAttributionPaths);
    const targets = await Promise.all(
        packages.map(async (packagePlan) => {
            return changelogTargetFor(input, packagePlan, ignoredAttributionPaths);
        })
    );

    return {
        groupedMarkdown: input.prLogEngine.renderGroupedTargetChangelog({
            packageInfo: input.packageInfo,
            currentDate: input.currentDate,
            validLabels: input.validLabels,
            githubRepo: input.githubRepo,
            targets: targets.map(targetSectionFrom)
        }),
        packageMarkdownByName: packageMarkdownByNameFrom(input, targets)
    };
}
