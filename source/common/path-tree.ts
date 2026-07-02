import path from 'node:path';
import { packageManifestFilePath } from './package-layout.ts';

export const pathTreeNodeType = {
    directory: 'directory',
    file: 'file'
} as const;

type PathTreeNodeLike = {
    readonly name: string;
    readonly type: (typeof pathTreeNodeType)[keyof typeof pathTreeNodeType];
};

const manifestFilePriority = 0;
const directoryPriority = 1;
const regularFilePriority = 2;

function priorityOf(node: PathTreeNodeLike): number {
    if (node.type === pathTreeNodeType.file && node.name === packageManifestFilePath) {
        return manifestFilePriority;
    }
    if (node.type === pathTreeNodeType.directory) {
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
    readonly type: typeof pathTreeNodeType.directory;
    readonly path: string;
    readonly name: string;
    readonly depth: number;
};

export type PathTreeFileNode<T> = {
    readonly type: typeof pathTreeNodeType.file;
    readonly path: string;
    readonly name: string;
    readonly depth: number;
    readonly item: T;
};

export type PathTreeNode<T> = PathTreeDirectoryNode | PathTreeFileNode<T>;

type MutableDirectory<T> = {
    readonly entries: readonly PathEntry<T>[];
    readonly name: string;
};

type PathEntry<T> = {
    readonly item: T;
    readonly path: string;
    readonly parts: readonly [string, ...readonly string[]];
};

type DirectoryChild<T> = {
    readonly node: PathTreeDirectoryNode;
    readonly directory: MutableDirectory<T>;
};

type FileChild<T> = {
    readonly node: PathTreeFileNode<T>;
};

type TreeChild<T> = DirectoryChild<T> | FileChild<T>;

function isDirectoryChild<T>(child: TreeChild<T>): child is DirectoryChild<T> {
    return child.node.type === pathTreeNodeType.directory;
}

function toPathEntries<T>(items: readonly T[], getPath: (item: T) => string): readonly PathEntry<T>[] {
    return items.map(function (item) {
        const itemPath = getPath(item);
        const pathParts = itemPath.split('/');
        return { item, path: itemPath, parts: [ pathParts.at(0) ?? itemPath, ...pathParts.slice(1) ] };
    });
}

function toNestedDirectoryEntry<T>(entry: PathEntry<T>): readonly [string, PathEntry<T>] | undefined {
    const [ name, nextPart, ...remainingParts ] = entry.parts;
    if (nextPart === undefined) {
        return undefined;
    }
    return [ name, { ...entry, parts: [ nextPart, ...remainingParts ] } ];
}

function toDirectoryGroups<T>(entries: readonly PathEntry<T>[]): readonly MutableDirectory<T>[] {
    const groups = new Map<string, PathEntry<T>[]>();

    for (const entry of entries) {
        const nestedEntry = toNestedDirectoryEntry(entry);
        if (nestedEntry !== undefined) {
            const [ name, groupedEntry ] = nestedEntry;
            const groupedEntries = groups.get(name) ?? [];
            groupedEntries.push(groupedEntry);
            groups.set(name, groupedEntries);
        }
    }

    return Array.from(groups, function ([ name, groupedEntries ]) {
        return { name, entries: groupedEntries };
    });
}

function toDirectoryChildren<T>(
    entries: readonly PathEntry<T>[],
    directoryPath: string,
    depth: number
): readonly TreeChild<T>[] {
    return toDirectoryGroups(entries).map(function (entry) {
        const node: PathTreeDirectoryNode = {
            type: pathTreeNodeType.directory,
            path: path.posix.join(directoryPath, entry.name),
            name: entry.name,
            depth: depth + 1
        };
        return { node, directory: entry };
    });
}

function toFileChildren<T>(entries: readonly PathEntry<T>[], depth: number): readonly TreeChild<T>[] {
    return entries.flatMap(function (entry) {
        if (entry.parts.length !== 1) {
            return [];
        }
        const node: PathTreeFileNode<T> = {
            type: pathTreeNodeType.file,
            path: entry.path,
            name: path.posix.basename(entry.path),
            depth,
            item: entry.item
        };
        return [ { node } ];
    });
}

function flattenTree<T>(
    entries: readonly PathEntry<T>[],
    directoryPath: string,
    depth: number
): readonly PathTreeNode<T>[] {
    const nodes: PathTreeNode<T>[] = [];
    const children = [ ...toDirectoryChildren(entries, directoryPath, depth), ...toFileChildren(entries, depth) ]
        .toSorted(
            function (left, right) {
                return comparePathNodes(left.node, right.node);
            }
        );
    for (const child of children) {
        nodes.push(child.node);
        if (isDirectoryChild(child)) {
            nodes.push(...flattenTree(child.directory.entries, child.node.path, child.node.depth));
        }
    }
    return nodes;
}

export function buildPathTree<T>(items: readonly T[], getPath: (item: T) => string): readonly PathTreeNode<T>[] {
    return flattenTree(toPathEntries(items, getPath), '', 0);
}
