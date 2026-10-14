import { isDeepStrictEqual } from 'node:util';
import { maximumDate } from '../common/maximum-date.ts';
import {
    bundleRelativePath,
    packageManifestFilePath,
    softwareBillOfMaterialsArtifactFilePath
} from '../common/package-layout.ts';
import type { FileDescription } from '../file-manager/file-description.ts';
import type { BuildAndPublishResult } from './package-processor.ts';
import {
    releaseAnalysisClassification,
    type PackageReleaseAnalysis,
    type PackageReleaseAnalysisClassification,
    type ReleaseAnalysis
} from './packtory-results.ts';
import { publishedReleaseStatus } from './published-release-state.ts';

type PackageReleaseAnalysisWithPublishedDate = PackageReleaseAnalysis & { readonly latestPublishedAt: Date; };

function dependencyOnlyPackageManifestFields(): readonly string[] {
    return [
        'bundleDependencies',
        'bundledDependencies',
        'dependencies',
        'optionalDependencies',
        'peerDependencies',
        'peerDependenciesMeta',
        'version'
    ];
}

function isDependencyOnlyPackageManifestField(key: string): boolean {
    return dependencyOnlyPackageManifestFields().includes(key);
}

function parseJavaScriptObjectNotationFile(fileContent: string): unknown {
    try {
        return JSON.parse(fileContent) as unknown;
    } catch {
        return Number.NEGATIVE_INFINITY;
    }
}

function packageManifestValueForComparison(index: ReadonlyMap<string, FileDescription>): unknown {
    const packageManifestFile = index.get(packageManifestFilePath);
    return packageManifestFile === undefined
        ? Number.NEGATIVE_INFINITY
        : parseJavaScriptObjectNotationFile(packageManifestFile.content);
}

function includesClassification(
    current: PackageReleaseAnalysisClassification,
    next: PackageReleaseAnalysisClassification,
    classification: PackageReleaseAnalysisClassification
): boolean {
    return current === classification || next === classification;
}

function moreSignificantClassification(
    current: PackageReleaseAnalysisClassification,
    next: PackageReleaseAnalysisClassification
): PackageReleaseAnalysisClassification {
    if (includesClassification(current, next, releaseAnalysisClassification.firstPublish)) {
        return releaseAnalysisClassification.firstPublish;
    }

    if (includesClassification(current, next, releaseAnalysisClassification.substantive)) {
        return releaseAnalysisClassification.substantive;
    }

    return releaseAnalysisClassification.dependencyOnly;
}

function hasLatestPublishedAt(
    analysis: PackageReleaseAnalysis
): analysis is PackageReleaseAnalysisWithPublishedDate {
    return analysis.latestPublishedAt !== undefined;
}

function isChangedPackageAnalysis(analysis: PackageReleaseAnalysis): boolean {
    return analysis.classification !== releaseAnalysisClassification.unchanged;
}

function hasInvalidPackageManifestValues(previousValue: unknown, newValue: unknown): boolean {
    return previousValue === Number.NEGATIVE_INFINITY || newValue === Number.NEGATIVE_INFINITY;
}

function normalizePackageManifestForDependencyComparison(value: unknown): unknown {
    return JSON.parse(
        JSON.stringify(value, function (key, entryValue: unknown) {
            return isDependencyOnlyPackageManifestField(key) ? undefined : entryValue;
        })
    ) as unknown;
}

function isDependencyDerivedFilePath(filePath: string): boolean {
    return filePath === packageManifestFilePath || filePath === softwareBillOfMaterialsArtifactFilePath;
}

function nonDependencyDerivedFilesMatch(
    previousIndex: ReadonlyMap<string, FileDescription>,
    newIndex: ReadonlyMap<string, FileDescription>
): boolean {
    for (const [ filePath, previousFile ] of previousIndex) {
        const currentFile = newIndex.get(filePath);
        if (!isDependencyDerivedFilePath(filePath) && !isDeepStrictEqual(previousFile, currentFile)) {
            return false;
        }
    }

    return true;
}

function packageManifestChangeIsDependencyOnly(
    previousIndex: ReadonlyMap<string, FileDescription>,
    newIndex: ReadonlyMap<string, FileDescription>
): boolean {
    const previousPackageManifestValue = packageManifestValueForComparison(previousIndex);
    const newPackageManifestValue = packageManifestValueForComparison(newIndex);

    if (hasInvalidPackageManifestValues(previousPackageManifestValue, newPackageManifestValue)) {
        return false;
    }

    return isDeepStrictEqual(
        normalizePackageManifestForDependencyComparison(previousPackageManifestValue),
        normalizePackageManifestForDependencyComparison(newPackageManifestValue)
    );
}

function fileDescriptionByBundleRelativePath(files: readonly FileDescription[]): ReadonlyMap<string, FileDescription> {
    const index = new Map<string, FileDescription>();
    for (const file of files) {
        index.set(bundleRelativePath(file.filePath), file);
    }
    return index;
}

type ComparisonIndexes = {
    readonly previousIndex: ReadonlyMap<string, FileDescription>;
    readonly newIndex: ReadonlyMap<string, FileDescription>;
};

function createComparisonIndexes(
    previousFiles: readonly FileDescription[],
    newFiles: readonly FileDescription[]
): ComparisonIndexes {
    return {
        previousIndex: fileDescriptionByBundleRelativePath(previousFiles),
        newIndex: fileDescriptionByBundleRelativePath(newFiles)
    };
}

function isDependencyOnlyPublishedChange(
    previousFiles: readonly FileDescription[],
    newFiles: readonly FileDescription[]
): boolean {
    if (previousFiles.length !== newFiles.length) {
        return false;
    }

    const { previousIndex, newIndex } = createComparisonIndexes(previousFiles, newFiles);

    if (!nonDependencyDerivedFilesMatch(previousIndex, newIndex)) {
        return false;
    }

    return packageManifestChangeIsDependencyOnly(previousIndex, newIndex);
}

export function classifyPackageRelease(
    buildResult: BuildAndPublishResult,
    newFiles: readonly FileDescription[]
): PackageReleaseAnalysis {
    const latestPublishedVersion = buildResult.previousReleaseArtifacts.isJust
        ? buildResult.previousReleaseArtifacts.value.version
        : undefined;
    const latestPublishedAt = buildResult.previousReleaseArtifacts.isJust
        ? buildResult.previousReleaseArtifacts.value.publishedAt
        : undefined;

    if (buildResult.status === publishedReleaseStatus.alreadyPublished) {
        return {
            classification: releaseAnalysisClassification.unchanged,
            latestPublishedAt,
            latestPublishedVersion,
            name: buildResult.bundle.name
        };
    }

    if (buildResult.previousReleaseArtifacts.isNothing) {
        return {
            classification: releaseAnalysisClassification.firstPublish,
            name: buildResult.bundle.name
        };
    }

    const isDependencyOnly = isDependencyOnlyPublishedChange(
        buildResult.previousReleaseArtifacts.value.files,
        newFiles
    );
    const classification: PackageReleaseAnalysisClassification = isDependencyOnly
        ? releaseAnalysisClassification.dependencyOnly
        : releaseAnalysisClassification.substantive;

    return {
        classification,
        latestPublishedAt,
        latestPublishedVersion,
        name: buildResult.bundle.name
    };
}

function mostRecentPublishedAt(publishedDates: readonly Date[]): Date | undefined {
    return publishedDates.reduce<Date | undefined>(function (currentMostRecent, publishedAt) {
        return currentMostRecent === undefined ? publishedAt : maximumDate(currentMostRecent, [ publishedAt ]);
    }, undefined);
}

export function summarizeReleaseAnalysis(packageAnalyses: readonly PackageReleaseAnalysis[]): ReleaseAnalysis {
    let classification: PackageReleaseAnalysisClassification = releaseAnalysisClassification.unchanged;
    const publishedDates: Date[] = [];

    const changedPackageAnalyses = packageAnalyses.filter(isChangedPackageAnalysis);
    for (const analysis of changedPackageAnalyses) {
        classification = moreSignificantClassification(classification, analysis.classification);
        if (hasLatestPublishedAt(analysis)) {
            publishedDates.push(analysis.latestPublishedAt);
        }
    }

    return {
        classification,
        mostRecentPublishedAt: mostRecentPublishedAt(publishedDates),
        packageAnalyses
    };
}
