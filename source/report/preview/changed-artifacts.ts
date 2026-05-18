import type { PreviewDiffHunk } from './artifact-diff-builder.ts';
import type { PreviewArtifact, PreviewArtifactNode } from './artifact-tree-builder.ts';

export type ChangedPreviewArtifact = PreviewArtifact & {
    readonly diff: readonly PreviewDiffHunk[];
};

export function collectChangedArtifacts(tree: readonly PreviewArtifactNode[]): readonly ChangedPreviewArtifact[] {
    return tree.flatMap((node) => {
        if (node.type !== 'file') {
            return [];
        }
        const { artifact } = node;
        return artifact.diff === undefined ? [] : [{ ...artifact, diff: artifact.diff }];
    });
}
