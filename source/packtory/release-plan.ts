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
    type ChangelogSourceAttributionDependencies
} from './changelog-source-attribution.ts';

type ReleasePlanArtifactState = ReleasePlanPackage['artifactState'];
type CollectArtifactContents = (
    bundle: BuildAndPublishResult['bundle'],
    prefix: string | undefined,
    extraFiles: BuildAndPublishResult['extraFiles']
) => readonly FileDescription[];

export type ReleasePlanMapperDependencies = ChangelogSourceAttributionDependencies & {
    readonly artifactsBuilder: { readonly collectContents: CollectArtifactContents };
};

function sortedUnique(values: readonly string[]): readonly string[] {
    return Array.from(new Set(values)).toSorted(compareValues);
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
    currentGitHead: string | undefined
): Promise<ReleasePlanPackage> {
    const newFiles = dependencies.artifactsBuilder.collectContents(
        buildResult.bundle,
        'package',
        buildResult.extraFiles
    );
    const artifactState = artifactStateFrom(buildResult);
    const latestRegistryMetadata = registryMetadataFrom(buildResult);
    return {
        name: buildResult.bundle.name,
        previousVersion: latestRegistryMetadata?.version,
        nextVersion: buildResult.bundle.version,
        artifactState,
        changed: artifactState !== 'unchanged',
        previousGitHead: latestRegistryMetadata?.gitHead,
        currentGitHead,
        latestRegistryMetadata,
        artifactFiles: packageRelativeFiles(newFiles),
        changedArtifactFiles: changedArtifactFilesFrom(artifactState, buildResult, newFiles),
        sourceFiles: sourceFilesFrom(analyzedBundle),
        changelogSourceFiles: await attributeChangelogSourceFiles(dependencies, analyzedBundle)
    };
}
