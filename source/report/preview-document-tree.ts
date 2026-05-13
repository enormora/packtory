type PreviewArtifactNodeLike = {
    readonly name: string;
    readonly type: 'directory' | 'file';
};

export function treeNodeSortKey(node: PreviewArtifactNodeLike): string {
    if (node.type === 'file' && node.name === 'package.json') {
        return `0:${node.name}`;
    }
    if (node.type === 'directory') {
        return `1:${node.name}`;
    }
    return `2:${node.name}`;
}

export function compareTreeNodes(left: PreviewArtifactNodeLike, right: PreviewArtifactNodeLike): number {
    return treeNodeSortKey(left).localeCompare(treeNodeSortKey(right));
}
