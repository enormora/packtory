import path from 'node:path';
import type {
    PullRequestLogConfiguration,
    PullRequestChangedFile,
    PullRequest,
    PullRequestWithLabel,
    TargetChangelogSection,
    PullRequestLogEngine
} from '../changelog/pull-request-log.ts';
import { compareValues } from '../common/sort-values.ts';
import { releaseAnalysisClassification, type ReleasePlanPackage } from './packtory-results.ts';
import { isPackageManifestInputPath } from './changelog-source-attribution.ts';
import { expandChangelogSourceFilesForHistory } from './changelog-source-file-history.ts';

type ChangelogTarget = {
    readonly packagePlan: ReleasePlanPackage;
    readonly manifestDependencyPullRequests: readonly PullRequestWithLabel[];
    readonly pullRequests: readonly PullRequestWithLabel[];
};
type ChangelogDependencyUpdate = ReleasePlanPackage['changelogDependencyUpdates'][number];

type CollectedPullRequests = {
    readonly manifestDependencyPullRequests: readonly PullRequestWithLabel[];
    readonly pullRequests: readonly PullRequestWithLabel[];
};
type PullRequestTargetContext = {
    readonly changedFilesByPullRequest: ReadonlyMap<number, readonly PullRequestChangedFile[]>;
    readonly dependencyPullRequestIdentifiers: ReadonlySet<number>;
    readonly targetSourceFiles: ReadonlySet<string>;
};

type PullRequestLogMethods = readonly [
    'collectMergedPullRequests',
    'filterPullRequestsByTargetFiles',
    'readPullRequestChangedFiles',
    'renderGroupedTargetChangelog',
    'renderTargetChangelog',
    'resolveChangelogBaseReference',
    'resolveLatestSemverChangelogBaseReference',
    'resolvePullRequestLabels'
];

type PullRequestLogMethod = PullRequestLogMethods[number];

function dependencyUpdateLabel(): string {
    return 'upgrade';
}

function dependencyUpdateTitleFor(update: ChangelogDependencyUpdate | undefined): string {
    if (update === undefined) {
        throw new Error('Expected a dependency update');
    }
    return `Update ${update.name} to ${update.version}`;
}

function dependencyUpdateTitle(packagePlan: ReleasePlanPackage): string {
    if (packagePlan.changelogDependencyUpdates.length !== 1) {
        return 'Update dependencies';
    }

    const update = packagePlan.changelogDependencyUpdates[0];
    return dependencyUpdateTitleFor(update);
}

function syntheticDependencyPullRequestIdentifier(): 0 {
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
    readonly explicitBaseReference: string | undefined;
    readonly githubRepository: string;
    readonly ignoredAttributionPaths: readonly string[];
    readonly packages: readonly ReleasePlanPackage[];
    readonly packageTagFormat: string | undefined;
    readonly pullRequestLogConfiguration: PullRequestLogConfiguration;
    readonly pullRequestLogEngine: Pick<PullRequestLogEngine, PullRequestLogMethod>;
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
        const changedFiles = changedFilesByPullRequest.get(pullRequest.identifier);
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

function mergePullRequests<T extends PullRequest>(pullRequests: readonly T[]): readonly T[] {
    const pullRequestsByIdentifier = new Map(
        pullRequests.map(function (pullRequest) {
            return [ pullRequest.identifier, pullRequest ] as const;
        })
    );
    return Array.from(pullRequestsByIdentifier.values());
}

function targetFilePath(file: PullRequestChangedFile): string {
    return file.path.split(path.sep).join('/');
}

function touchesPackageManifestInput(changedFiles: readonly PullRequestChangedFile[]): boolean {
    return changedFiles.some(function (changedFile) {
        return isPackageManifestInputPath(targetFilePath(changedFile));
    });
}

function touchesNonManifestTargetSource(
    changedFiles: readonly PullRequestChangedFile[],
    targetSourceFiles: ReadonlySet<string>
): boolean {
    return changedFiles.some(function (changedFile) {
        const filePath = targetFilePath(changedFile);
        return targetSourceFiles.has(filePath) && !isPackageManifestInputPath(filePath);
    });
}

function shouldKeepPackagePullRequest(
    pullRequest: PullRequestWithLabel,
    context: PullRequestTargetContext
): boolean {
    if (
        context.dependencyPullRequestIdentifiers.has(pullRequest.identifier) ||
        pullRequest.label !== dependencyUpdateLabel()
    ) {
        return true;
    }

    const changedFiles = context.changedFilesByPullRequest.get(pullRequest.identifier) ?? [];
    return touchesNonManifestTargetSource(changedFiles, context.targetSourceFiles) ||
        !touchesPackageManifestInput(changedFiles);
}

async function resolveBaseReferenceFor(
    pullRequestLogEngine: GenerateChangelogInput['pullRequestLogEngine'],
    packagePlan: ReleasePlanPackage,
    input: Pick<GenerateChangelogInput, 'explicitBaseReference' | 'packageTagFormat'>
): Promise<string> {
    if (
        input.explicitBaseReference === undefined &&
        packagePlan.previousVersion === undefined &&
        packagePlan.previousGitHead === undefined
    ) {
        const baseReference = await pullRequestLogEngine.resolveLatestSemverChangelogBaseReference();
        return baseReference.reference;
    }

    const baseReference = await pullRequestLogEngine.resolveChangelogBaseReference({
        packageName: packagePlan.name,
        previousVersion: packagePlan.previousVersion,
        previousGitHead: packagePlan.previousGitHead,
        packageTagFormat: input.packageTagFormat,
        explicitBaseReference: input.explicitBaseReference
    });
    return baseReference.reference;
}

async function collectTargetPullRequests(
    input: GenerateChangelogInput,
    packagePlan: ReleasePlanPackage,
    ignoredAttributionPaths: readonly string[]
): Promise<CollectedPullRequests> {
    const baseReference = await resolveBaseReferenceFor(input.pullRequestLogEngine, packagePlan, input);
    const pullRequests = await input.pullRequestLogEngine.collectMergedPullRequests({
        githubRepository: input.githubRepository,
        baseReference
    });
    const changedFilesByPullRequest = await input.pullRequestLogEngine.readPullRequestChangedFiles({
        githubRepository: input.githubRepository,
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
    const packagePullRequests = input.pullRequestLogEngine.filterPullRequestsByTargetFiles({
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
    const dependencyPullRequestIdentifiers = new Set(
        dependencyPullRequests.map(function (pullRequest) {
            return pullRequest.identifier;
        })
    );
    const labeledPullRequests = await input.pullRequestLogEngine.resolvePullRequestLabels({
        githubRepository: input.githubRepository,
        configuration: input.pullRequestLogConfiguration,
        pullRequests: mergePullRequests([ ...packagePullRequests, ...dependencyPullRequests ]),
        targetName: packagePlan.name,
        targetScopedLabelPattern: input.targetScopedLabelPattern
    });

    return {
        manifestDependencyPullRequests: labeledPullRequests.filter(function (pullRequest) {
            return dependencyPullRequestIdentifiers.has(pullRequest.identifier);
        }),
        pullRequests: labeledPullRequests.filter(function (pullRequest) {
            return shouldKeepPackagePullRequest(pullRequest, {
                changedFilesByPullRequest,
                dependencyPullRequestIdentifiers,
                targetSourceFiles: new Set(targetSourceFiles)
            });
        })
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

function syntheticDependencyPullRequestFor(update: ChangelogDependencyUpdate | undefined): PullRequestWithLabel {
    return {
        identifier: syntheticDependencyPullRequestIdentifier(),
        title: dependencyUpdateTitleFor(update),
        label: dependencyUpdateLabel()
    };
}

function manifestPullRequestsForUpdate(
    target: ChangelogTarget,
    update: ChangelogDependencyUpdate
): readonly PullRequestWithLabel[] {
    return target.manifestDependencyPullRequests.filter(function (pullRequest) {
        return pullRequestTitleMentionsDependency(pullRequest, update.name);
    });
}

function dependencyUpdatePullRequestsFor(target: ChangelogTarget): readonly PullRequestWithLabel[] {
    return mergePullRequests(
        target.packagePlan.changelogDependencyUpdates.flatMap(function (update) {
            const manifestPullRequests = manifestPullRequestsForUpdate(target, update);
            return manifestPullRequests.length > 0
                ? manifestPullRequests
                : [ syntheticDependencyPullRequestFor(update) ];
        })
    );
}

function dependencyUpdatePullRequestIdentifiersFor(target: ChangelogTarget): ReadonlySet<number> {
    return new Set(
        target.packagePlan.changelogDependencyUpdates.flatMap(function (update) {
            return manifestPullRequestsForUpdate(target, update).map(function (pullRequest) {
                return pullRequest.identifier;
            });
        })
    );
}

function unmatchedManifestDependencyPullRequestsFor(target: ChangelogTarget): readonly PullRequestWithLabel[] {
    const dependencyUpdatePullRequestIdentifiers = dependencyUpdatePullRequestIdentifiersFor(target);
    return target.manifestDependencyPullRequests.filter(function (pullRequest) {
        return !dependencyUpdatePullRequestIdentifiers.has(pullRequest.identifier);
    });
}

function nonManifestPullRequestsFor(target: ChangelogTarget): readonly PullRequestWithLabel[] {
    const manifestPullRequestIdentifiers = new Set(
        target.manifestDependencyPullRequests.map(function (pullRequest) {
            return pullRequest.identifier;
        })
    );
    return target.pullRequests.filter(function (pullRequest) {
        return !manifestPullRequestIdentifiers.has(pullRequest.identifier);
    });
}

function dependencyOnlyChangelogPullRequestsFor(target: ChangelogTarget): readonly PullRequestWithLabel[] {
    if (
        target.packagePlan.changelogDependencyUpdates.length > 0 &&
        target.manifestDependencyPullRequests.length === 0
    ) {
        return [
            {
                identifier: syntheticDependencyPullRequestIdentifier(),
                title: dependencyUpdateTitle(target.packagePlan),
                label: dependencyUpdateLabel()
            }
        ];
    }

    const pullRequests = target.manifestDependencyPullRequests.length > 0
        ? target.manifestDependencyPullRequests
        : target.pullRequests;
    return pullRequests.map(function (pullRequest) {
        return {
            ...pullRequest,
            title: dependencyUpdateTitle(target.packagePlan),
            label: dependencyUpdateLabel()
        };
    });
}

function changelogPullRequestsFor(target: ChangelogTarget): readonly PullRequestWithLabel[] {
    if (isDependencyOnlyTarget(target)) {
        return dependencyOnlyChangelogPullRequestsFor(target);
    }

    return [
        ...nonManifestPullRequestsFor(target),
        ...dependencyUpdatePullRequestsFor(target),
        ...unmatchedManifestDependencyPullRequestsFor(target)
    ];
}

function pullRequestLogConfigurationForRendering(
    configuration: PullRequestLogConfiguration
): PullRequestLogConfiguration {
    if (configuration.validLabels.has(dependencyUpdateLabel())) {
        return configuration;
    }
    return {
        ...configuration,
        validLabels: new Map([ ...configuration.validLabels, [ dependencyUpdateLabel(), 'Dependency Upgrades' ] ])
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
    return target.pullRequests.length > 0 || target.packagePlan.changelogDependencyUpdates.length > 0;
}

function removeSyntheticDependencyPullRequestLinks(markdown: string, githubRepository: string): string {
    return markdown.replaceAll(
        ` ([#${syntheticDependencyPullRequestIdentifier()}](https://github.com/${githubRepository}/pull/${syntheticDependencyPullRequestIdentifier()}))`,
        ''
    );
}

function createPackageMarkdownByName(
    input: GenerateChangelogInput,
    targets: readonly ChangelogTarget[]
): ReadonlyMap<string, string> {
    const configuration = pullRequestLogConfigurationForRendering(input.pullRequestLogConfiguration);
    return new Map(
        targets.filter(hasChangelogEntries).map(function (target) {
            const targetSection = createTargetSection(target);
            return [
                target.packagePlan.name,
                removeSyntheticDependencyPullRequestLinks(
                    input.pullRequestLogEngine.renderTargetChangelog({
                        configuration,
                        currentDate: input.currentDate,
                        githubRepository: input.githubRepository,
                        ...targetSection
                    }),
                    input.githubRepository
                )
            ] as const;
        })
    );
}

export async function generateChangelogOutputs(input: GenerateChangelogInput): Promise<GeneratedChangelog> {
    const packages = selectChangedPackages(input.packages);
    const ignoredAttributionPaths = mergeIgnoredAttributionPaths(packages, input.ignoredAttributionPaths);
    const configuration = pullRequestLogConfigurationForRendering(input.pullRequestLogConfiguration);
    const targets = await Promise.all(
        packages.map(async function (packagePlan) {
            return createChangelogTarget(input, packagePlan, ignoredAttributionPaths);
        })
    );
    const targetsWithEntries = targets.filter(hasChangelogEntries);

    return {
        groupedMarkdown: removeSyntheticDependencyPullRequestLinks(
            input.pullRequestLogEngine.renderGroupedTargetChangelog({
                configuration,
                currentDate: input.currentDate,
                githubRepository: input.githubRepository,
                targets: targetsWithEntries.map(createTargetSection)
            }),
            input.githubRepository
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
