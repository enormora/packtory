import type { PreviewArtifactNode } from './preview-document-helpers.ts';

export function collectChangedArtifacts(
    tree: readonly PreviewArtifactNode[]
): readonly NonNullable<PreviewArtifactNode['artifact']>[] {
    return tree.flatMap((node) => {
        if (node.type !== 'file') {
            return [];
        }
        const { artifact } = node;
        return artifact?.diff === undefined ? [] : [artifact];
    });
}
