import { bundleRelativePath, packageManifestFilePath } from '../common/package-layout.ts';
import { compareValues } from '../common/sort-values.ts';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { FileDescription } from '../file-manager/file-description.ts';
import { buildFileSetDiff } from '../report/release-diff/file-set-diff.ts';
import { canonicalizeReleaseArtifactFiles } from '../bundle-emitter/release-artifact-canonicalizer.ts';
import {
    releaseAnalysisClassification,
    type ReleasePlanPackage,
    type ReleasePlanRegistryMetadata
} from './packtory-results.ts';
import type { BuildAndPublishResult } from './package-processor.ts';
import { publishedReleaseArtifactsOf, wasAlreadyPublished } from './published-release-state.ts';
import {
    attributeSelectedChangelogSourceFiles,
    attributeChangelogSourceFiles,
    changedPackageManifestDependencyNames,
    packageManifestDependencyVersions,
    type ChangelogSourceAttributionDependencies
} from './changelog-source-attribution.ts';

type ReleasePlanArtifactState = ReleasePlanPackage['artifactState'];
export type CollectReleaseArtifactFiles = (
    bundle: BuildAndPublishResult['bundle'],
    prefix: string | undefined,
    extraFiles: BuildAndPublishResult['extraFiles']
) => readonly FileDescription[];

type ChangelogSourceInputOptions = {
    readonly additionalChangelogSourceFiles: {
        readonly packageFiles: readonly string[];
        readonly sharedFiles: readonly string[];
    };
};
type ReleasePlanPackageInput = {
    readonly changelogSourceOptions: ChangelogSourceInputOptions;
    readonly currentGitHead: string | undefined;
    readonly releaseClassification: ReleasePlanPackage['releaseClassification'];
    readonly releaseArtifactFiles: readonly FileDescription[];
};
type AttributedChangelogSourceFilesInput = {
    readonly analyzedBundle: AnalyzedBundle;
    readonly changelogSourceFiles: readonly string[];
    readonly changedArtifactFiles: readonly string[];
    readonly dependencies: ReleasePlanMapperDependencies;
    readonly releaseClassification: ReleasePlanPackage['releaseClassification'];
};

export type ReleasePlanMapperDependencies = ChangelogSourceAttributionDependencies;

function sortedUnique(values: readonly string[]): readonly string[] {
    return Array.from(new Set(values)).toSorted(compareValues);
}

function collectReleasePlanChangelogSourceFiles(resolveOptions: ChangelogSourceInputOptions): readonly string[] {
    return resolveOptions.additionalChangelogSourceFiles.packageFiles;
}

function packageRelativeFiles(files: readonly FileDescription[]): readonly string[] {
    return sortedUnique(
        files.map(function (file) {
            return bundleRelativePath(file.filePath);
        })
    );
}

function sourceFilesFrom(analyzedBundle: AnalyzedBundle): readonly string[] {
    return sortedUnique(
        analyzedBundle.contents.flatMap(function (entry) {
            return entry.isGeneratedManifest ? [] : [ entry.fileDescription.sourceFilePath ];
        })
    );
}

function registryMetadataFrom(buildResult: BuildAndPublishResult): ReleasePlanRegistryMetadata | undefined {
    const publishedReleaseArtifacts = publishedReleaseArtifactsOf(buildResult);
    if (publishedReleaseArtifacts === undefined) {
        return undefined;
    }
    return {
        version: publishedReleaseArtifacts.version,
        publishedAt: publishedReleaseArtifacts.publishedAt,
        gitHead: publishedReleaseArtifacts.gitHead
    };
}

function artifactStateFrom(buildResult: BuildAndPublishResult): ReleasePlanArtifactState {
    if (wasAlreadyPublished(buildResult)) {
        return 'unchanged';
    }
    return publishedReleaseArtifactsOf(buildResult) === undefined ? 'first-publish' : 'changed';
}

function changedArtifactFilesFrom(
    artifactState: ReleasePlanArtifactState,
    buildResult: BuildAndPublishResult,
    newFiles: readonly FileDescription[]
): readonly string[] {
    if (artifactState === 'unchanged') {
        return [];
    }
    const publishedReleaseArtifacts = publishedReleaseArtifactsOf(buildResult);
    if (publishedReleaseArtifacts === undefined) {
        return packageRelativeFiles(newFiles);
    }
    const diff = buildFileSetDiff(
        canonicalizeReleaseArtifactFiles(publishedReleaseArtifacts.files),
        canonicalizeReleaseArtifactFiles(newFiles)
    );
    return sortedUnique([
        ...diff.added.map(function (file) {
            return bundleRelativePath(file.path);
        }),
        ...diff.removed.map(function (file) {
            return bundleRelativePath(file.path);
        }),
        ...diff.modified.map(function (file) {
            return bundleRelativePath(file.path);
        })
    ]);
}

function manifestArtifactContentFrom(files: readonly FileDescription[]): string | undefined {
    const manifestFile = files.find(function (file) {
        return bundleRelativePath(file.filePath) === packageManifestFilePath;
    });
    return manifestFile === undefined ? undefined : manifestFile.content;
}

function collectReleasePlanChangelogDependencyNames(
    buildResult: BuildAndPublishResult,
    currentFiles: readonly FileDescription[]
): readonly string[] {
    const previousFiles = publishedReleaseArtifactsOf(buildResult)?.files;
    const previousManifest = previousFiles === undefined ? undefined : manifestArtifactContentFrom(previousFiles);
    const currentManifest = manifestArtifactContentFrom(currentFiles);
    if (previousManifest === undefined) {
        return [];
    }
    if (currentManifest === undefined) {
        return [];
    }

    return changedPackageManifestDependencyNames(previousManifest, currentManifest);
}

function collectReleasePlanChangelogDependencyUpdates(
    currentFiles: readonly FileDescription[],
    changelogDependencyNames: readonly string[]
): ReleasePlanPackage['changelogDependencyUpdates'] {
    const currentManifest = manifestArtifactContentFrom(currentFiles);
    if (currentManifest === undefined) {
        return [];
    }

    return packageManifestDependencyVersions(currentManifest, changelogDependencyNames);
}

function shouldAttributeAllBundleSources(releaseClassification: ReleasePlanPackage['releaseClassification']): boolean {
    return (
        releaseClassification === releaseAnalysisClassification.dependencyOnly ||
        releaseClassification === releaseAnalysisClassification.unchanged
    );
}

async function attributedChangelogSourceFiles(input: AttributedChangelogSourceFilesInput): Promise<readonly string[]> {
    if (shouldAttributeAllBundleSources(input.releaseClassification)) {
        return attributeChangelogSourceFiles(input.dependencies, input.analyzedBundle, input.changelogSourceFiles);
    }

    return attributeSelectedChangelogSourceFiles(
        input.dependencies,
        input.analyzedBundle,
        input.changelogSourceFiles,
        new Set(input.changedArtifactFiles)
    );
}

export async function createReleasePlanPackage(
    dependencies: ReleasePlanMapperDependencies,
    analyzedBundle: AnalyzedBundle,
    buildResult: BuildAndPublishResult,
    input: ReleasePlanPackageInput
): Promise<ReleasePlanPackage> {
    const artifactState = artifactStateFrom(buildResult);
    const latestRegistryMetadata = registryMetadataFrom(buildResult);
    const changedArtifactFiles = changedArtifactFilesFrom(artifactState, buildResult, input.releaseArtifactFiles);
    const changelogSourceFiles = collectReleasePlanChangelogSourceFiles(input.changelogSourceOptions);
    const changelogDependencyNames = collectReleasePlanChangelogDependencyNames(
        buildResult,
        input.releaseArtifactFiles
    );
    const changelogDependencyUpdates = collectReleasePlanChangelogDependencyUpdates(
        input.releaseArtifactFiles,
        changelogDependencyNames
    );
    return {
        name: buildResult.bundle.name,
        previousVersion: latestRegistryMetadata?.version,
        nextVersion: buildResult.bundle.version,
        artifactState,
        releaseClassification: input.releaseClassification,
        changed: artifactState !== 'unchanged',
        previousGitHead: latestRegistryMetadata?.gitHead,
        currentGitHead: input.currentGitHead,
        latestRegistryMetadata,
        artifactFiles: packageRelativeFiles(input.releaseArtifactFiles),
        changedArtifactFiles,
        sourceFiles: sourceFilesFrom(analyzedBundle),
        changelogDependencyNames,
        changelogDependencyUpdates,
        changelogSourceFiles: await attributedChangelogSourceFiles({
            analyzedBundle,
            changedArtifactFiles,
            changelogSourceFiles,
            dependencies,
            releaseClassification: input.releaseClassification
        })
    };
}
