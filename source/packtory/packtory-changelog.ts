import path from 'node:path';
import type { PrLogEngine, PullRequestWithLabel, TargetChangelogSection } from '@pr-log/core';
import { compareValues } from '../common/sort-values.ts';
import type { ReleasePlanPackage } from './packtory-results.ts';

type ChangelogTarget = {
    readonly packagePlan: ReleasePlanPackage;
    readonly pullRequests: readonly PullRequestWithLabel[];
};

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

    return input.prLogEngine.resolvePullRequestLabels({
        githubRepo: input.githubRepo,
        validLabels: input.validLabels,
        ignoredLabels: [],
        pullRequests: packagePullRequests,
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

function createTargetSection(target: ChangelogTarget): TargetChangelogSection {
    return {
        targetName: target.packagePlan.name,
        unreleased: false,
        versionNumber: target.packagePlan.nextVersion,
        mergedPullRequests: target.pullRequests
    };
}

function hasChangelogEntries(target: ChangelogTarget): boolean {
    return target.pullRequests.length > 0;
}

function createPackageMarkdownByName(
    input: GenerateChangelogInput,
    targets: readonly ChangelogTarget[]
): ReadonlyMap<string, string> {
    return new Map(
        targets.filter(hasChangelogEntries).map((target) => {
            const targetSection = createTargetSection(target);
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
    const packages = selectChangedPackages(input.packages);
    const ignoredAttributionPaths = mergeIgnoredAttributionPaths(packages, input.ignoredAttributionPaths);
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
            validLabels: input.validLabels,
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
