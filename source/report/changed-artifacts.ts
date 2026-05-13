import type { PreviewArtifact, PreviewArtifactNode, PreviewDiffHunk } from './preview-document-helpers.ts';

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
