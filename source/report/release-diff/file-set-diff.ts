import { isTextDiffablePath } from '../../common/code-files.ts';
import { areFileDescriptionEqual } from '../../file-manager/equal.ts';
import type { FileDescription } from '../../file-manager/file-description.ts';
import type { PreviewDiffHunk } from '../preview/artifact-diff-builder.ts';
import { buildFileHunks } from './file-hunks.ts';

export type AddedFile = {
    readonly path: string;
    readonly sizeBytes: number;
    readonly isExecutable: boolean;
};

export type RemovedFile = {
    readonly path: string;
    readonly sizeBytes: number;
    readonly isExecutable: boolean;
};

export type UnchangedFile = {
    readonly path: string;
    readonly sizeBytes: number;
    readonly isExecutable: boolean;
};

export type ModifiedFileContentChange =
    | { readonly kind: 'binary' }
    | { readonly kind: 'mode-only' }
    | { readonly kind: 'text'; readonly hunks: readonly PreviewDiffHunk[] };

export type ModifiedFile = {
    readonly path: string;
    readonly oldSizeBytes: number;
    readonly newSizeBytes: number;
    readonly oldIsExecutable: boolean;
    readonly newIsExecutable: boolean;
    readonly contentChange: ModifiedFileContentChange;
};

export type FileSetDiff = {
    readonly added: readonly AddedFile[];
    readonly removed: readonly RemovedFile[];
    readonly modified: readonly ModifiedFile[];
    readonly unchanged: readonly UnchangedFile[];
};

function sizeOf(content: string): number {
    return Buffer.byteLength(content, 'utf8');
}

function indexByPath(files: readonly FileDescription[]): ReadonlyMap<string, FileDescription> {
    return new Map(
        files.map((file) => {
            return [file.filePath, file] as const;
        })
    );
}

function classifyContentChange(previous: FileDescription, current: FileDescription): ModifiedFileContentChange {
    if (previous.content === current.content) {
        return { kind: 'mode-only' };
    }
    if (!isTextDiffablePath(current.filePath)) {
        return { kind: 'binary' };
    }
    return { kind: 'text', hunks: buildFileHunks(current.filePath, previous.content, current.content) };
}

function toAdded(file: FileDescription): AddedFile {
    return { path: file.filePath, sizeBytes: sizeOf(file.content), isExecutable: file.isExecutable };
}

function toRemoved(file: FileDescription): RemovedFile {
    return { path: file.filePath, sizeBytes: sizeOf(file.content), isExecutable: file.isExecutable };
}

function toUnchanged(file: FileDescription): UnchangedFile {
    return { path: file.filePath, sizeBytes: sizeOf(file.content), isExecutable: file.isExecutable };
}

function toModified(previous: FileDescription, current: FileDescription): ModifiedFile {
    return {
        path: current.filePath,
        oldSizeBytes: sizeOf(previous.content),
        newSizeBytes: sizeOf(current.content),
        oldIsExecutable: previous.isExecutable,
        newIsExecutable: current.isExecutable,
        contentChange: classifyContentChange(previous, current)
    };
}

type FilePairEntry = {
    readonly path: string;
    readonly previous: FileDescription | undefined;
    readonly current: FileDescription | undefined;
};

function pairsByPath(
    previousIndex: ReadonlyMap<string, FileDescription>,
    newIndex: ReadonlyMap<string, FileDescription>
): readonly FilePairEntry[] {
    const allPaths = new Set<string>([...previousIndex.keys(), ...newIndex.keys()]);
    return Array.from(allPaths, (path) => {
        return { path, previous: previousIndex.get(path), current: newIndex.get(path) };
    });
}

function isEqual(previous: FileDescription, current: FileDescription, path: string): boolean {
    return areFileDescriptionEqual({ ...previous, filePath: path }, { ...current, filePath: path });
}

type FileSetDiffBuckets = {
    readonly added: AddedFile[];
    readonly removed: RemovedFile[];
    readonly modified: ModifiedFile[];
    readonly unchanged: UnchangedFile[];
};

function appendOneSidedEntry(buckets: FileSetDiffBuckets, entry: FilePairEntry): boolean {
    if (entry.previous !== undefined && entry.current === undefined) {
        buckets.removed.push(toRemoved(entry.previous));
        return true;
    }
    if (entry.previous === undefined && entry.current !== undefined) {
        buckets.added.push(toAdded(entry.current));
        return true;
    }
    return false;
}

function appendBothSidedEntry(buckets: FileSetDiffBuckets, entry: FilePairEntry): void {
    if (entry.previous === undefined || entry.current === undefined) {
        return;
    }
    if (isEqual(entry.previous, entry.current, entry.path)) {
        buckets.unchanged.push(toUnchanged(entry.current));
        return;
    }
    buckets.modified.push(toModified(entry.previous, entry.current));
}

function appendEntryToBuckets(buckets: FileSetDiffBuckets, entry: FilePairEntry): void {
    if (appendOneSidedEntry(buckets, entry)) {
        return;
    }
    appendBothSidedEntry(buckets, entry);
}

export function buildFileSetDiff(
    previousFiles: readonly FileDescription[],
    newFiles: readonly FileDescription[]
): FileSetDiff {
    const previousIndex = indexByPath(previousFiles);
    const newIndex = indexByPath(newFiles);
    const buckets: FileSetDiffBuckets = { added: [], removed: [], modified: [], unchanged: [] };
    for (const entry of pairsByPath(previousIndex, newIndex)) {
        appendEntryToBuckets(buckets, entry);
    }
    return buckets;
}
