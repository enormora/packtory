import path from 'node:path';
import type { BuildAndPublishResult } from '../packtory/package-processor.ts';
import type { PublishAllResult } from '../packtory/packtory.ts';
import type { ArtifactEntry, EliminatedSourceFile } from '../progress/progress-broadcaster.ts';
import { createStructuredPatch } from '../common/typed-diff.ts';
import type { PackageReport } from './report-aggregator.ts';
import { isDiffableArtifact, toDiffLineType } from './preview-document-diff.ts';
import { compareTreeNodes, treeNodeSortKey } from './preview-document-tree.ts';

const diffContextLines = 3;
const diffHunkLimit = 2;

export type PreviewResultType = 'checks' | 'config' | 'partial' | 'success';

export type PreviewDiffLine = {
    readonly type: 'add' | 'context' | 'remove';
    readonly text: string;
};

export type PreviewDiffHunk = {
    readonly header: string;
    readonly lines: readonly PreviewDiffLine[];
};

export type PreviewArtifact = ArtifactEntry & {
    readonly diff?: readonly PreviewDiffHunk[];
};

export type PreviewDirectoryNode = {
    readonly path: string;
    readonly name: string;
    readonly depth: number;
    readonly type: 'directory';
};

export type PreviewFileNode = {
    readonly path: string;
    readonly name: string;
    readonly depth: number;
    readonly type: 'file';
    readonly artifact: PreviewArtifact;
};

export type PreviewArtifactNode = PreviewDirectoryNode | PreviewFileNode;

type FinalArtifactContent = {
    readonly content: string;
    readonly sourcePath?: string | undefined;
};

type BundleArtifactIndex = ReadonlyMap<string, ReadonlyMap<string, FinalArtifactContent>>;

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

export function isPreviewableResult(result: PublishAllResult): boolean {
    return result.isOk || (result.error.type === 'partial' && result.error.succeeded.length > 0);
}

export function getSucceededResults(result: PublishAllResult): readonly BuildAndPublishResult[] {
    if (result.isOk) {
        return result.value;
    }
    if (result.error.type === 'partial') {
        return result.error.succeeded;
    }
    return [];
}

export function getIssues(result: PublishAllResult): readonly string[] {
    if (result.isOk) {
        return [];
    }

    if (result.error.type === 'partial') {
        return result.error.failures.map((failure) => {
            return failure.message;
        });
    }

    return result.error.issues;
}

export function getResultType(result: PublishAllResult): PreviewResultType {
    if (result.isOk) {
        return 'success';
    }
    return result.error.type;
}

export function buildBundleArtifactIndex(results: readonly BuildAndPublishResult[]): BundleArtifactIndex {
    return new Map(
        results.map((result) => {
            const entries = new Map<string, FinalArtifactContent>([
                ['package.json', { content: result.bundle.manifestFile.content }]
            ]);
            for (const entry of result.bundle.contents) {
                entries.set(entry.fileDescription.targetFilePath, {
                    content: entry.fileDescription.content,
                    sourcePath: entry.fileDescription.sourceFilePath
                });
            }
            return [result.bundle.name, entries] as const;
        })
    );
}

// eslint-disable-next-line max-statements -- diff construction intentionally validates, loads, and shapes hunks in one place
export async function buildDiffForArtifact(
    packageName: string,
    artifact: ArtifactEntry,
    bundleArtifactIndex: BundleArtifactIndex,
    readWorkspaceFile: (filePath: string) => Promise<string>
): Promise<readonly PreviewDiffHunk[] | undefined> {
    if (!isDiffableArtifact(artifact)) {
        return undefined;
    }
    const packageArtifacts = bundleArtifactIndex.get(packageName);
    const finalArtifact = packageArtifacts?.get(artifact.path);
    if (finalArtifact?.sourcePath !== artifact.sourcePath) {
        return undefined;
    }
    const originalContent = await readWorkspaceFile(artifact.sourcePath);
    if (originalContent === finalArtifact.content) {
        return undefined;
    }
    const patchFile = createStructuredPatch(
        artifact.path,
        artifact.path,
        originalContent,
        finalArtifact.content,
        undefined,
        undefined,
        {
            context: diffContextLines
        }
    );
    return patchFile.hunks.slice(0, diffHunkLimit).map((hunk) => {
        return {
            header: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
            lines: hunk.lines
                .filter((line) => {
                    return !line.startsWith('\\');
                })
                .map((line) => {
                    return {
                        type: toDiffLineType(line),
                        text: line
                    };
                })
        };
    });
}

function createDirectory(pathname: string, name: string, depth: number): MutableDirectory {
    return {
        name,
        path: pathname,
        depth,
        directories: new Map(),
        files: []
    };
}

function insertArtifact(root: RootDirectory, artifact: PreviewArtifact): void {
    const parts = artifact.path.split('/');
    let current = root;
    for (const part of parts.slice(0, -1)) {
        const nextPath = path.posix.join(current.path, part);
        const next = current.directories.get(part) ?? createDirectory(nextPath, part, current.depth + 1);
        current.directories.set(part, next);
        current = next;
    }
    current.files.push(artifact);
}

function flattenTree(directory: RootDirectory): readonly PreviewArtifactNode[] {
    const nodes: PreviewArtifactNode[] = [];
    const directoryEntries = Array.from(directory.directories.values());
    const directoryChildren: readonly TreeChild[] = directoryEntries.map((entry) => {
        const node = {
            path: entry.path,
            name: entry.name,
            depth: entry.depth,
            type: 'directory'
        } satisfies PreviewDirectoryNode;
        return {
            node,
            directory: entry,
            sortKey: treeNodeSortKey(node)
        };
    });
    const fileChildren: readonly TreeChild[] = directory.files.map((artifact) => {
        const node = {
            path: artifact.path,
            name: path.posix.basename(artifact.path),
            depth: directory.depth,
            type: 'file',
            artifact
        } satisfies PreviewFileNode;
        return {
            node,
            sortKey: treeNodeSortKey(node)
        };
    });
    const children = [...directoryChildren, ...fileChildren].toSorted((left, right) => {
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
    const root: RootDirectory = {
        path: '',
        depth: 0,
        directories: new Map(),
        files: []
    };
    for (const artifact of artifacts) {
        insertArtifact(root, artifact);
    }
    return flattenTree(root);
}

export function buildVersionTransition(packageReport: PackageReport): string | undefined {
    const { version } = packageReport.decisions;
    if (version === undefined) {
        return undefined;
    }
    if (version.previousVersion === undefined) {
        return version.chosenVersion;
    }
    return `${version.previousVersion} -> ${version.chosenVersion}`;
}

export function hasMeaningfulChanges(
    artifacts: readonly PreviewArtifact[],
    eliminatedSourceFiles: readonly EliminatedSourceFile[]
): boolean {
    if (eliminatedSourceFiles.length > 0) {
        return true;
    }
    return artifacts.some((artifact) => {
        return artifact.status === 'changed';
    });
}
