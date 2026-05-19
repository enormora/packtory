import path from 'node:path';

type PathTreeNodeLike = {
    readonly name: string;
    readonly type: 'directory' | 'file';
};

const manifestFilePriority = 0;
const directoryPriority = 1;
const regularFilePriority = 2;

function priorityOf(node: PathTreeNodeLike): number {
    if (node.type === 'file' && node.name === 'package.json') {
        return manifestFilePriority;
    }
    if (node.type === 'directory') {
        return directoryPriority;
    }
    return regularFilePriority;
}

function comparePathNodes(left: PathTreeNodeLike, right: PathTreeNodeLike): number {
    const priorityDifference = priorityOf(left) - priorityOf(right);
    if (priorityDifference !== 0) {
        return priorityDifference;
    }
    return left.name.localeCompare(right.name);
}

type PathTreeDirectoryNode = {
    readonly type: 'directory';
    readonly path: string;
    readonly name: string;
    readonly depth: number;
};

export type PathTreeFileNode<T> = {
    readonly type: 'file';
    readonly path: string;
    readonly name: string;
    readonly depth: number;
    readonly item: T;
};

export type PathTreeNode<T> = PathTreeDirectoryNode | PathTreeFileNode<T>;

type MutableDirectory<T> = {
    readonly name: string;
    readonly path: string;
    readonly depth: number;
    readonly directories: Map<string, MutableDirectory<T>>;
    readonly files: T[];
};

type RootDirectory<T> = {
    readonly path: string;
    readonly depth: number;
    readonly directories: Map<string, MutableDirectory<T>>;
    readonly files: T[];
};

type TreeChild<T> = {
    readonly node: PathTreeNode<T>;
    readonly directory?: MutableDirectory<T>;
};

function createDirectory<T>(pathname: string, name: string, depth: number): MutableDirectory<T> {
    return { name, path: pathname, depth, directories: new Map(), files: [] };
}

function insertItem<T>(root: RootDirectory<T>, item: T, itemPath: string): void {
    const parts = itemPath.split('/');
    let current: MutableDirectory<T> | RootDirectory<T> = root;
    for (const part of parts.slice(0, -1)) {
        const nextPath = path.posix.join(current.path, part);
        const next: MutableDirectory<T> =
            current.directories.get(part) ?? createDirectory(nextPath, part, current.depth + 1);
        current.directories.set(part, next);
        current = next;
    }
    current.files.push(item);
}

function toDirectoryChildren<T>(directory: RootDirectory<T>): readonly TreeChild<T>[] {
    return Array.from(directory.directories.values(), (entry) => {
        const node: PathTreeDirectoryNode = {
            type: 'directory',
            path: entry.path,
            name: entry.name,
            depth: entry.depth
        };
        return { node, directory: entry };
    });
}

function toFileChildren<T>(directory: RootDirectory<T>, getPath: (item: T) => string): readonly TreeChild<T>[] {
    return directory.files.map((item) => {
        const itemPath = getPath(item);
        const node: PathTreeFileNode<T> = {
            type: 'file',
            path: itemPath,
            name: path.posix.basename(itemPath),
            depth: directory.depth,
            item
        };
        return { node };
    });
}

function flattenTree<T>(directory: RootDirectory<T>, getPath: (item: T) => string): readonly PathTreeNode<T>[] {
    const nodes: PathTreeNode<T>[] = [];
    const children = [...toDirectoryChildren(directory), ...toFileChildren(directory, getPath)].toSorted(
        (left, right) => {
            return comparePathNodes(left.node, right.node);
        }
    );
    for (const child of children) {
        nodes.push(child.node);
        if (child.directory !== undefined) {
            nodes.push(...flattenTree(child.directory, getPath));
        }
    }
    return nodes;
}

export function buildPathTree<T>(items: readonly T[], getPath: (item: T) => string): readonly PathTreeNode<T>[] {
    const root: RootDirectory<T> = { path: '', depth: 0, directories: new Map(), files: [] };
    for (const item of items) {
        insertItem(root, item, getPath(item));
    }
    return flattenTree(root, getPath);
}
