import { buildPathTree, pathTreeNodeType, type PathTreeNode } from '../../common/path-tree.ts';
import type { ArtifactEntry } from '../../progress/progress-broadcaster.ts';
import type { PreviewDiffHunk } from './preview-document-diff.ts';

export type PreviewArtifact = ArtifactEntry & {
    readonly diff?: readonly PreviewDiffHunk[];
};

type PreviewDirectoryNode = {
    readonly path: string;
    readonly name: string;
    readonly depth: number;
    readonly type: typeof pathTreeNodeType.directory;
};

type PreviewFileNode = {
    readonly path: string;
    readonly name: string;
    readonly depth: number;
    readonly type: typeof pathTreeNodeType.file;
    readonly artifact: PreviewArtifact;
};

export type PreviewArtifactNode = PreviewDirectoryNode | PreviewFileNode;

function toPreviewArtifactNode(node: PathTreeNode<PreviewArtifact>): PreviewArtifactNode {
    if (node.type === pathTreeNodeType.directory) {
        return { type: pathTreeNodeType.directory, path: node.path, name: node.name, depth: node.depth };
    }
    return {
        type: pathTreeNodeType.file,
        path: node.path,
        name: node.name,
        depth: node.depth,
        artifact: node.item
    };
}

export function buildArtifactTree(artifacts: readonly PreviewArtifact[]): readonly PreviewArtifactNode[] {
    return buildPathTree(artifacts, function (artifact) {
        return artifact.path;
    })
        .map(toPreviewArtifactNode);
}
