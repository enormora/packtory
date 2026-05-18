import path from 'node:path';
import type { ArtifactEntry } from '../../progress/progress-broadcaster.ts';
import type { PreviewDiffHunk } from './artifact-diff-builder.ts';
import { compareTreeNodes, treeNodeSortKey } from './preview-document-tree.ts';

export type PreviewArtifact = ArtifactEntry & {
    readonly diff?: readonly PreviewDiffHunk[];
};

type PreviewDirectoryNode = {
    readonly path: string;
    readonly name: string;
    readonly depth: number;
    readonly type: 'directory';
};

type PreviewFileNode = {
    readonly path: string;
    readonly name: string;
    readonly depth: number;
    readonly type: 'file';
    readonly artifact: PreviewArtifact;
};

export type PreviewArtifactNode = PreviewDirectoryNode | PreviewFileNode;

type MutableDirectory = {
    readonly name: string;
    readonly path: string;
    readonly depth: number;
    readonly directories: Map<string, MutableDirectory>;
    readonly files: PreviewArtifact[];
};

type RootDirectory = {
    readonly path: string;
    readonly depth: number;
    readonly directories: Map<string, MutableDirectory>;
    readonly files: PreviewArtifact[];
};

type TreeChild = {
    readonly node: PreviewArtifactNode;
    readonly directory?: MutableDirectory;
    readonly sortKey: string;
};

function createDirectory(pathname: string, name: string, depth: number): MutableDirectory {
    return { name, path: pathname, depth, directories: new Map(), files: [] };
}

function insertArtifact(root: RootDirectory, artifact: PreviewArtifact): void {
    const parts = artifact.path.split('/');
    let current: MutableDirectory | RootDirectory = root;
    for (const part of parts.slice(0, -1)) {
        const nextPath = path.posix.join(current.path, part);
        const next: MutableDirectory =
            current.directories.get(part) ?? createDirectory(nextPath, part, current.depth + 1);
        current.directories.set(part, next);
        current = next;
    }
    current.files.push(artifact);
}

function toDirectoryChildren(directory: RootDirectory): readonly TreeChild[] {
    return Array.from(directory.directories.values(), (entry) => {
        const node = {
            path: entry.path,
            name: entry.name,
            depth: entry.depth,
            type: 'directory'
        } satisfies PreviewDirectoryNode;
        return { node, directory: entry, sortKey: treeNodeSortKey(node) };
    });
}

function toFileChildren(directory: RootDirectory): readonly TreeChild[] {
    return directory.files.map((artifact) => {
        const node = {
            path: artifact.path,
            name: path.posix.basename(artifact.path),
            depth: directory.depth,
            type: 'file',
            artifact
        } satisfies PreviewFileNode;
        return { node, sortKey: treeNodeSortKey(node) };
    });
}

function flattenTree(directory: RootDirectory): readonly PreviewArtifactNode[] {
    const nodes: PreviewArtifactNode[] = [];
    const children = [...toDirectoryChildren(directory), ...toFileChildren(directory)].toSorted((left, right) => {
        return compareTreeNodes(left.node, right.node);
    });
    for (const child of children) {
        nodes.push(child.node);
        if (child.directory !== undefined) {
            nodes.push(...flattenTree(child.directory));
        }
    }
    return nodes;
}

export function buildArtifactTree(artifacts: readonly PreviewArtifact[]): readonly PreviewArtifactNode[] {
    const root: RootDirectory = { path: '', depth: 0, directories: new Map(), files: [] };
    for (const artifact of artifacts) {
        insertArtifact(root, artifact);
    }
    return flattenTree(root);
}
