import path from 'node:path';
import type {
    PrLogConfig,
    PrLogEngine,
    PullRequest,
    PullRequestChangedFile,
    PullRequestWithLabel,
    TargetChangelogSection
} from '@pr-log/core';
import { compareValues } from '../common/sort-values.ts';
import { releaseAnalysisClassification, type ReleasePlanPackage } from './packtory-results.ts';
import { isPackageManifestInputPath } from './changelog-source-attribution.ts';
import { expandChangelogSourceFilesForHistory } from './changelog-source-file-history.ts';

type ChangelogTarget = {
    readonly packagePlan: ReleasePlanPackage;
    readonly manifestDependencyPullRequests: readonly PullRequestWithLabel[];
    readonly pullRequests: readonly PullRequestWithLabel[];
};

type CollectedPullRequests = {
    readonly manifestDependencyPullRequests: readonly PullRequestWithLabel[];
    readonly pullRequests: readonly PullRequestWithLabel[];
};

type PrLogMethods = readonly [
    'collectMergedPullRequests',
    'filterPullRequestsByTargetFiles',
    'readPullRequestChangedFiles',
    'renderGroupedTargetChangelog',
    'renderTargetChangelog',
    'resolveChangelogBaseRef',
    'resolveLatestSemverChangelogBaseRef',
    'resolvePullRequestLabels'
];

type PrLogMethod = PrLogMethods[number];

function dependencyUpdateLabel(): string {
    return 'upgrade';
}

function dependencyUpdateTitle(packagePlan: ReleasePlanPackage): string {
    if (packagePlan.changelogDependencyUpdates.length !== 1) {
        return 'Update dependencies';
    }

    const update = packagePlan.changelogDependencyUpdates[0];
    if (update === undefined) {
        throw new Error('Expected a dependency update');
    }
    return `Update ${update.name} to ${update.version}`;
}

function syntheticDependencyPullRequestId(): 0 {
    return 0;
}

function emptyChangelogSourceFileRoots(): readonly string[] {
    return new Array<string>();
}

function changelogSourceFileRootsForPackage(
    changelogSourceFileRootsByPackageName: ReadonlyMap<string, readonly string[]>,
    packageName: string
): readonly string[] {
    const sourceFileRoots = changelogSourceFileRootsByPackageName.get(packageName);
    if (sourceFileRoots === undefined) {
        return emptyChangelogSourceFileRoots();
    }
    return sourceFileRoots;
}

export type GenerateChangelogInput = {
    readonly changelogSourceFileRootsByPackageName: ReadonlyMap<string, readonly string[]>;
    readonly currentDate: Date;
    readonly explicitBaseRef: string | undefined;
    readonly githubRepo: string;
    readonly ignoredAttributionPaths: readonly string[];
    readonly packages: readonly ReleasePlanPackage[];
    readonly packageTagFormat: string | undefined;
    readonly prLogConfig: PrLogConfig;
    readonly prLogEngine: Pick<PrLogEngine, PrLogMethod>;
    readonly targetScopedLabelPattern: string | undefined;
};

export type GeneratedChangelog = {
    readonly groupedMarkdown: string;
    readonly packageNamesWithoutChangelogEntries: readonly string[];
    readonly packageMarkdownByName: ReadonlyMap<string, string>;
};

function selectChangedPackages(packages: readonly ReleasePlanPackage[]): readonly ReleasePlanPackage[] {
    return packages.filter(function (packagePlan) {
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
            packages.flatMap(function (packagePlan) {
                return packagePlan.changelogSourceFiles.filter(isChangelogFilePath);
            })
        )
    );
}

function mergeIgnoredAttributionPaths(
    packages: readonly ReleasePlanPackage[],
    configuredPaths: readonly string[]
): readonly string[] {
    return sortUniqueValues(new Set([ ...collectChangelogPaths(packages), ...configuredPaths ]));
}

function pullRequestTitleMentionsDependency(pullRequest: PullRequest, dependencyName: string): boolean {
    return pullRequest.title.toLowerCase().includes(dependencyName.toLowerCase());
}

function selectManifestDependencyPullRequests(
    packagePlan: ReleasePlanPackage,
    pullRequests: readonly PullRequest[],
    changedFilesByPullRequest: ReadonlyMap<number, readonly PullRequestChangedFile[]>
): readonly PullRequest[] {
    return pullRequests.filter(function (pullRequest) {
        const changedFiles = changedFilesByPullRequest.get(pullRequest.id);
        return (
            changedFiles !== undefined &&
            changedFiles.some(function (changedFile) {
                return isPackageManifestInputPath(changedFile.path);
            }) &&
            packagePlan.changelogDependencyNames.some(function (dependencyName) {
                return pullRequestTitleMentionsDependency(pullRequest, dependencyName);
            })
        );
    });
}

function mergePullRequests(pullRequests: readonly PullRequest[]): readonly PullRequest[] {
    const pullRequestsById = new Map(
        pullRequests.map(function (pullRequest) {
            return [ pullRequest.id, pullRequest ] as const;
        })
    );
    return Array.from(pullRequestsById.values());
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
): Promise<CollectedPullRequests> {
    const baseRef = await resolveBaseRefFor(input.prLogEngine, packagePlan, input);
    const pullRequests = await input.prLogEngine.collectMergedPullRequests({
        githubRepo: input.githubRepo,
        baseRef
    });
    const changedFilesByPullRequest = await input.prLogEngine.readPullRequestChangedFiles({
        githubRepo: input.githubRepo,
        pullRequests
    });
    const targetSourceFiles = expandChangelogSourceFilesForHistory({
        changedFilesByPullRequest,
        packagePlan,
        sourceFileRoots: changelogSourceFileRootsForPackage(
            input.changelogSourceFileRootsByPackageName,
            packagePlan.name
        )
    });
    const packagePullRequests = input.prLogEngine.filterPullRequestsByTargetFiles({
        targetName: packagePlan.name,
        targetSourceFiles,
        pullRequests,
        changedFilesByPullRequest,
        ignoredAttributionPaths
    });
    const dependencyPullRequests = selectManifestDependencyPullRequests(
        packagePlan,
        pullRequests,
        changedFilesByPullRequest
    );
    const dependencyPullRequestIds = new Set(
        dependencyPullRequests.map(function (pullRequest) {
            return pullRequest.id;
        })
    );
    const labeledPullRequests = await input.prLogEngine.resolvePullRequestLabels({
        githubRepo: input.githubRepo,
        config: input.prLogConfig,
        pullRequests: mergePullRequests([ ...packagePullRequests, ...dependencyPullRequests ]),
        targetName: packagePlan.name,
        targetScopedLabelPattern: input.targetScopedLabelPattern
    });

    return {
        manifestDependencyPullRequests: labeledPullRequests.filter(function (pullRequest) {
            return dependencyPullRequestIds.has(pullRequest.id);
        }),
        pullRequests: labeledPullRequests
    };
}

async function createChangelogTarget(
    input: GenerateChangelogInput,
    packagePlan: ReleasePlanPackage,
    ignoredAttributionPaths: readonly string[]
): Promise<ChangelogTarget> {
    const pullRequests = await collectTargetPullRequests(input, packagePlan, ignoredAttributionPaths);
    return {
        packagePlan,
        manifestDependencyPullRequests: pullRequests.manifestDependencyPullRequests,
        pullRequests: pullRequests.pullRequests
    };
}

function isDependencyOnlyTarget(target: ChangelogTarget): boolean {
    return target.packagePlan.releaseClassification === releaseAnalysisClassification.dependencyOnly;
}

function isSubstitutionOnlyDependencyTarget(target: ChangelogTarget): boolean {
    return (
        isDependencyOnlyTarget(target) &&
        target.packagePlan.changelogDependencyUpdates.length > 0 &&
        target.manifestDependencyPullRequests.length === 0
    );
}

function changelogPullRequestsFor(target: ChangelogTarget): readonly PullRequestWithLabel[] {
    if (!isDependencyOnlyTarget(target)) {
        return target.pullRequests;
    }

    if (isSubstitutionOnlyDependencyTarget(target)) {
        return [
            {
                id: syntheticDependencyPullRequestId(),
                title: dependencyUpdateTitle(target.packagePlan),
                label: dependencyUpdateLabel()
            }
        ];
    }

    const pullRequests = target.manifestDependencyPullRequests.length > 0
        ? target.manifestDependencyPullRequests
        : target.pullRequests;
    return pullRequests.map(function (pullRequest) {
        return { ...pullRequest, title: dependencyUpdateTitle(target.packagePlan), label: dependencyUpdateLabel() };
    });
}

function prLogConfigForRendering(config: PrLogConfig): PrLogConfig {
    if (config.validLabels.has(dependencyUpdateLabel())) {
        return config;
    }
    return {
        ...config,
        validLabels: new Map([ ...config.validLabels, [ dependencyUpdateLabel(), 'Dependency Upgrades' ] ])
    };
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
    return target.pullRequests.length > 0 || isSubstitutionOnlyDependencyTarget(target);
}

function removeSyntheticDependencyPullRequestLinks(markdown: string, githubRepo: string): string {
    return markdown.replaceAll(
        ` ([#${syntheticDependencyPullRequestId()}](https://github.com/${githubRepo}/pull/${syntheticDependencyPullRequestId()}))`,
        ''
    );
}

function createPackageMarkdownByName(
    input: GenerateChangelogInput,
    targets: readonly ChangelogTarget[]
): ReadonlyMap<string, string> {
    const config = prLogConfigForRendering(input.prLogConfig);
    return new Map(
        targets.filter(hasChangelogEntries).map(function (target) {
            const targetSection = createTargetSection(target);
            return [
                target.packagePlan.name,
                removeSyntheticDependencyPullRequestLinks(
                    input.prLogEngine.renderTargetChangelog({
                        config,
                        currentDate: input.currentDate,
                        githubRepo: input.githubRepo,
                        ...targetSection
                    }),
                    input.githubRepo
                )
            ] as const;
        })
    );
}

export async function generateChangelogOutputs(input: GenerateChangelogInput): Promise<GeneratedChangelog> {
    const packages = selectChangedPackages(input.packages);
    const ignoredAttributionPaths = mergeIgnoredAttributionPaths(packages, input.ignoredAttributionPaths);
    const config = prLogConfigForRendering(input.prLogConfig);
    const targets = await Promise.all(
        packages.map(async function (packagePlan) {
            return createChangelogTarget(input, packagePlan, ignoredAttributionPaths);
        })
    );
    const targetsWithEntries = targets.filter(hasChangelogEntries);

    return {
        groupedMarkdown: removeSyntheticDependencyPullRequestLinks(
            input.prLogEngine.renderGroupedTargetChangelog({
                config,
                currentDate: input.currentDate,
                githubRepo: input.githubRepo,
                targets: targetsWithEntries.map(createTargetSection)
            }),
            input.githubRepo
        ),
        packageNamesWithoutChangelogEntries: targets
            .filter(function (target) {
                return !hasChangelogEntries(target);
            })
            .map(function (target) {
                return target.packagePlan.name;
            }),
        packageMarkdownByName: createPackageMarkdownByName(input, targets)
    };
}
