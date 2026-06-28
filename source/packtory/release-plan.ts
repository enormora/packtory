import { bundleRelativePath } from '../common/package-layout.ts';
import { compareValues } from '../common/sort-values.ts';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { FileDescription } from '../file-manager/file-description.ts';
import { buildFileSetDiff } from '../report/release-diff/file-set-diff.ts';
import { canonicalizeReleaseArtifactFiles } from '../bundle-emitter/release-artifact-canonicalizer.ts';
import type { ReleasePlanPackage, ReleasePlanRegistryMetadata } from './packtory-results.ts';
import type { BuildAndPublishResult } from './package-processor.ts';
import { publishedReleaseArtifactsOf, wasAlreadyPublished } from './published-release-state.ts';
import {
    attributeChangelogSourceFiles,
    collectManifestChangelogSourceFiles,
    type ChangelogSourceAttributionDependencies
} from './changelog-source-attribution.ts';

type ReleasePlanArtifactState = ReleasePlanPackage['artifactState'];
export type CollectReleaseArtifactFiles = (
    bundle: BuildAndPublishResult['bundle'],
    prefix: string | undefined,
    extraFiles: BuildAndPublishResult['extraFiles']
) => readonly FileDescription[];

type ChangelogSourceInputOptions = {
    readonly additionalChangelogSourceFiles: readonly string[];
    readonly mainPackageJson: Parameters<typeof collectManifestChangelogSourceFiles>[0];
};
type ReleasePlanPackageInput = {
    readonly changelogSourceFiles: readonly string[];
    readonly currentGitHead: string | undefined;
    readonly releaseClassification: ReleasePlanPackage['releaseClassification'];
    readonly releaseArtifactFiles: readonly FileDescription[];
};

export type ReleasePlanMapperDependencies = ChangelogSourceAttributionDependencies;

function sortedUnique(values: readonly string[]): readonly string[] {
    return Array.from(new Set(values)).toSorted(compareValues);
}

export function collectReleasePlanChangelogSourceFiles(resolveOptions: ChangelogSourceInputOptions): readonly string[] {
    return collectManifestChangelogSourceFiles(
        resolveOptions.mainPackageJson,
        resolveOptions.additionalChangelogSourceFiles
    );
}

function packageRelativeFiles(files: readonly FileDescription[]): readonly string[] {
    return sortedUnique(
        files.map((file) => {
            return bundleRelativePath(file.filePath);
        })
    );
}

function sourceFilesFrom(analyzedBundle: AnalyzedBundle): readonly string[] {
    return sortedUnique(
        analyzedBundle.contents.flatMap((entry) => {
            return entry.isGeneratedManifest ? [] : [entry.fileDescription.sourceFilePath];
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
        ...diff.added.map((file) => {
            return bundleRelativePath(file.path);
        }),
        ...diff.removed.map((file) => {
            return bundleRelativePath(file.path);
        }),
        ...diff.modified.map((file) => {
            return bundleRelativePath(file.path);
        })
    ]);
}

export async function createReleasePlanPackage(
    dependencies: ReleasePlanMapperDependencies,
    analyzedBundle: AnalyzedBundle,
    buildResult: BuildAndPublishResult,
    input: ReleasePlanPackageInput
): Promise<ReleasePlanPackage> {
    const artifactState = artifactStateFrom(buildResult);
    const latestRegistryMetadata = registryMetadataFrom(buildResult);
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
        changedArtifactFiles: changedArtifactFilesFrom(artifactState, buildResult, input.releaseArtifactFiles),
        sourceFiles: sourceFilesFrom(analyzedBundle),
        changelogSourceFiles: await attributeChangelogSourceFiles(
            dependencies,
            analyzedBundle,
            input.changelogSourceFiles
        )
    };
}
