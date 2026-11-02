import type { EliminatedSourceFile } from '../../progress/progress-broadcaster.ts';
import type { PackageReport } from '../aggregator/report-types.ts';
import type { ComparisonRow } from './workspace-import-comparison.ts';
import type { PreviewArtifact, PreviewArtifactNode } from './artifact-tree-builder.ts';

export type ChangedPreviewArtifact = PreviewArtifact & {
    readonly diff: NonNullable<PreviewArtifact['diff']>;
};

export type PreviewArtifactCounts = {
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
