import type { PreviewArtifactNode } from './artifact-tree-builder.ts';

export function visibleArtifactTree(
    tree: readonly PreviewArtifactNode[],
    allFiles: boolean
): readonly PreviewArtifactNode[] {
    if (allFiles) {
        return tree;
    }
    const paths = tree
        .filter(function (node) {
            return node.type === 'file' && node.artifact.status !== 'unchanged';
        })
        .map(function (node) {
            return node.path;
        });
    return tree.filter(function (node) {
        if (node.type === 'file') {
            return node.artifact.status !== 'unchanged';
        }
        return paths.some(function (filePath) {
            return filePath.startsWith(`${node.path}/`);
        });
    });
}

export function hiddenArtifactCount(tree: readonly PreviewArtifactNode[], allFiles: boolean): number {
    if (allFiles) {
        return 0;
    }
    return tree
        .filter(function (node) {
            return node.type === 'file' && node.artifact.status === 'unchanged';
        })
        .length;
}
