import type { EliminatedSourceFile } from '../../progress/progress-broadcaster.ts';
import type { PackageReport } from '../aggregator/report-types.ts';
import type { ComparisonRow } from './workspace-import-comparison.ts';
import { buildDiffForArtifact } from './artifact-diff-builder.ts';
import { buildArtifactTree, type PreviewArtifact, type PreviewArtifactNode } from './artifact-tree-builder.ts';
import type { BundleArtifactIndex } from './bundle-artifact-index.ts';
import { buildVersionTransition, hasMeaningfulChanges } from './preview-document-state.ts';
import { buildWorkspaceComparison } from './workspace-comparison.ts';

type PackageArtifactData = {
    readonly changedArtifacts: readonly ChangedPreviewArtifact[];
    readonly artifactCounts: PreviewArtifactCounts;
};

function collectPackageArtifactData(artifacts: readonly PreviewArtifact[]): PackageArtifactData {
    const changedArtifacts: ChangedPreviewArtifact[] = [];
    const emittedArtifacts = artifacts.length;
    let changedArtifactCount = 0;

    for (const artifact of artifacts) {
        if (artifact.status === 'changed') {
            changedArtifactCount += 1;
        }
        if (artifact.diff !== undefined) {
            changedArtifacts.push({ ...artifact, diff: artifact.diff });
        }
    }

    return {
        changedArtifacts,
        artifactCounts: {
            emitted: emittedArtifacts,
            changed: changedArtifactCount
        }
    };
}

async function buildPreviewArtifactWithDiff(
    packageName: string,
    artifact: PreviewArtifact,
    bundleArtifactIndex: BundleArtifactIndex,
    readWorkspaceFile: (filePath: string) => Promise<string>
): Promise<PreviewArtifact> {
    const diff = await buildDiffForArtifact(packageName, artifact, bundleArtifactIndex, readWorkspaceFile);
    if (diff === undefined) {
        return artifact;
    }
    return {
        ...artifact,
        diff
    };
}

export async function buildPreviewPackage(
    packageName: string,
    packageReport: PackageReport,
    bundleArtifactIndex: BundleArtifactIndex,
    readWorkspaceFile: (filePath: string) => Promise<string>
): Promise<PreviewPackage> {
    const emittedArtifacts = packageReport.outputs?.tarball.entries ?? [];
    const artifacts = await Promise.all(
        emittedArtifacts.map(async function (artifact) {
            return buildPreviewArtifactWithDiff(packageName, artifact, bundleArtifactIndex, readWorkspaceFile);
        })
    );
    const eliminatedSourceFiles = packageReport.eliminatedSourceFiles ?? [];
    const comparison = buildWorkspaceComparison(packageReport, artifacts);
    const hasChanges = hasMeaningfulChanges(artifacts, eliminatedSourceFiles, comparison.comparisonRows);
    const tree = buildArtifactTree(artifacts);
    const { changedArtifacts, artifactCounts } = collectPackageArtifactData(artifacts);
    return {
        name: packageName,
        versionTransition: buildVersionTransition(packageReport),
        hasChanges,
        openByDefault: hasChanges || packageReport.failure !== undefined,
        tree,
        changedArtifacts,
        artifactCounts,
        eliminatedSourceFiles,
        failure: packageReport.failure,
        diagnostics: packageReport,
        ...comparison
    };
}

export type ChangedPreviewArtifact = PreviewArtifact & {
    readonly diff: NonNullable<PreviewArtifact['diff']>;
};

type PreviewArtifactCounts = {
    readonly emitted: number;
    readonly changed: number;
};

export type PreviewPackage = {
    readonly name: string;
    readonly versionTransition?: string | undefined;
    readonly hasChanges: boolean;
    readonly openByDefault: boolean;
    readonly tree: readonly PreviewArtifactNode[];
    readonly changedArtifacts: readonly ChangedPreviewArtifact[];
    readonly artifactCounts: PreviewArtifactCounts;
    readonly eliminatedSourceFiles: readonly EliminatedSourceFile[];
    readonly failure?: PackageReport['failure'];
    readonly diagnostics: PackageReport;
    readonly sourceTree?: readonly PreviewArtifactNode[] | undefined;
    readonly comparisonRows?: readonly ComparisonRow[] | undefined;
};
