import { isDeepStrictEqual } from 'node:util';
import { maxDate } from '../common/max-date.ts';
import type { FileDescription } from '../file-manager/file-description.ts';
import { sbomFilePath } from '../sbom/sbom-file.ts';
import type { BuildAndPublishResult } from './package-processor.ts';
import type {
    PackageReleaseAnalysis,
    PackageReleaseAnalysisClassification,
    ReleaseAnalysis
} from './packtory-results.ts';

const dependencyDerivedFilePaths = new Set(['package.json', sbomFilePath]);

const dependencyOnlyPackageJsonFields = new Set([
    'bundleDependencies',
    'bundledDependencies',
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
    'peerDependenciesMeta',
    'version'
]);

const unchangedPriority = 0;
const dependencyOnlyPriority = 1;
const substantivePriority = 2;
const firstPublishPriority = 3;
type ClassificationPriority =
    | typeof dependencyOnlyPriority
    | typeof firstPublishPriority
    | typeof substantivePriority
    | typeof unchangedPriority;

type PackageJsonComparisonValue = { readonly invalid: false; readonly value: unknown } | { readonly invalid: true };

function parseJsonFile(file: FileDescription): PackageJsonComparisonValue {
    const { content } = file;

    return (() => {
        try {
            return { invalid: false, value: JSON.parse(content) as unknown };
        } catch {
            return { invalid: true };
        }
    })();
}

function packageJsonValueForComparison(index: ReadonlyMap<string, FileDescription>): PackageJsonComparisonValue {
    const file = index.get('package.json');
    if (file === undefined) {
        return { invalid: true };
    }

    return parseJsonFile(file);
}

function maxClassificationPriority(
    current: ClassificationPriority,
    nextPriority: ClassificationPriority
): ClassificationPriority {
    const [highestPriority = unchangedPriority] = [current, nextPriority].toSorted((left, right) => {
        return right - left;
    });
    return highestPriority;
}

function hasLatestPublishedAt(
    analysis: PackageReleaseAnalysis
): analysis is PackageReleaseAnalysis & { readonly latestPublishedAt: Date } {
    return analysis.latestPublishedAt !== undefined;
}

function normalizePackageJsonForDependencyComparison(value: unknown): unknown {
    return JSON.parse(
        JSON.stringify(value, (key, entryValue: unknown) => {
            return dependencyOnlyPackageJsonFields.has(key) ? undefined : entryValue;
        })
    ) as unknown;
}

function indexFiles(files: readonly FileDescription[]): ReadonlyMap<string, FileDescription> {
    return new Map(
        files.map((file) => {
            return [file.filePath, file] as const;
        })
    );
}

function nonDependencyDerivedFilesMatch(
    previousIndex: ReadonlyMap<string, FileDescription>,
    newIndex: ReadonlyMap<string, FileDescription>
): boolean {
    return Array.from(previousIndex.entries()).every(([filePath, previousFile]) => {
        if (dependencyDerivedFilePaths.has(filePath)) {
            return true;
        }
        const currentFile = newIndex.get(filePath);
        return isDeepStrictEqual(previousFile, currentFile);
    });
}

function packageJsonChangeIsDependencyOnly(
    previousIndex: ReadonlyMap<string, FileDescription>,
    newIndex: ReadonlyMap<string, FileDescription>
): boolean {
    const previousPackageJsonValue = packageJsonValueForComparison(previousIndex);
    const newPackageJsonValue = packageJsonValueForComparison(newIndex);

    if (previousPackageJsonValue.invalid || newPackageJsonValue.invalid) {
        return false;
    }

    return isDeepStrictEqual(
        normalizePackageJsonForDependencyComparison(previousPackageJsonValue.value),
        normalizePackageJsonForDependencyComparison(newPackageJsonValue.value)
    );
}

function createComparisonIndexes(
    previousFiles: readonly FileDescription[],
    newFiles: readonly FileDescription[]
): {
    readonly previousIndex: ReadonlyMap<string, FileDescription>;
    readonly newIndex: ReadonlyMap<string, FileDescription>;
} {
    return {
        previousIndex: indexFiles(previousFiles),
        newIndex: indexFiles(newFiles)
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

    return packageJsonChangeIsDependencyOnly(previousIndex, newIndex);
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

    if (buildResult.status === 'already-published') {
        return {
            classification: 'unchanged',
            latestPublishedAt,
            latestPublishedVersion,
            name: buildResult.bundle.name
        };
    }

    if (buildResult.previousReleaseArtifacts.isNothing) {
        return {
            classification: 'first-publish',
            name: buildResult.bundle.name
        };
    }

    const classification: PackageReleaseAnalysisClassification = isDependencyOnlyPublishedChange(
        buildResult.previousReleaseArtifacts.value.files,
        newFiles
    )
        ? 'dependency-only'
        : 'substantive';

    return {
        classification,
        latestPublishedAt,
        latestPublishedVersion,
        name: buildResult.bundle.name
    };
}

export function summarizeReleaseAnalysis(packageAnalyses: readonly PackageReleaseAnalysis[]): ReleaseAnalysis {
    const changedAnalyses = packageAnalyses.filter((analysis) => {
        return analysis.classification !== 'unchanged';
    });
    const classificationPriority: Readonly<Record<PackageReleaseAnalysisClassification, ClassificationPriority>> = {
        unchanged: unchangedPriority,
        'dependency-only': dependencyOnlyPriority,
        substantive: substantivePriority,
        'first-publish': firstPublishPriority
    };
    const classificationByPriority: Readonly<Record<ClassificationPriority, PackageReleaseAnalysisClassification>> = {
        [unchangedPriority]: 'unchanged',
        [dependencyOnlyPriority]: 'dependency-only',
        [substantivePriority]: 'substantive',
        [firstPublishPriority]: 'first-publish'
    };
    const highestPriority = changedAnalyses.reduce<ClassificationPriority>((current, analysis) => {
        const nextPriority = classificationPriority[analysis.classification];
        return maxClassificationPriority(current, nextPriority);
    }, unchangedPriority);
    const classification = classificationByPriority[highestPriority];
    const publishedDates = changedAnalyses.filter(hasLatestPublishedAt).map((analysis) => {
        return analysis.latestPublishedAt;
    });
    const mostRecentPublishedAt = publishedDates.reduce<Date | undefined>((current, publishedAt) => {
        return current === undefined ? publishedAt : maxDate(current, [publishedAt]);
    }, undefined);

    return {
        classification,
        mostRecentPublishedAt,
        packageAnalyses
    };
}
