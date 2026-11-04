import type { PackageReport } from '../aggregator/report-types.ts';
import { buildArtifactTree, type PreviewArtifact, type PreviewArtifactNode } from './artifact-tree-builder.ts';
import type { ComparisonRow } from './workspace-import-comparison.ts';
import { compareWorkspace } from './workspace-snapshot-comparison.ts';

export type WorkspaceComparison = {
    readonly sourceTree: readonly PreviewArtifactNode[] | undefined;
    readonly comparisonRows: readonly ComparisonRow[] | undefined;
};

export function buildWorkspaceComparison(
    report: PackageReport,
    artifacts: readonly PreviewArtifact[]
): WorkspaceComparison {
    const snapshot = report.workspaceSnapshot;
    if (snapshot === undefined) {
        return { sourceTree: undefined, comparisonRows: undefined };
    }
    const sourceTree = buildArtifactTree(snapshot.files.map(function (file): PreviewArtifact {
        const emitted = artifacts.find(function (artifact) {
            return artifact.sourcePath === file.sourcePath;
        });
        return {
            path: file.path,
            sourcePath: file.sourcePath,
            sizeBytes: file.sizeBytes,
            kind: 'source',
            status: emitted?.status ?? 'changed',
            badges: []
        };
    }));
    return {
        sourceTree,
        comparisonRows: report.packageSnapshot === undefined
            ? undefined
            : compareWorkspace(snapshot, report.packageSnapshot)
    };
}
