import { isTextDiffablePath } from '../../common/code-files.ts';
import { areFileDescriptionEqual } from '../../file-manager/equal.ts';
import type { FileDescription } from '../../file-manager/file-description.ts';
import type { PackageReport } from '../aggregator/report-types.ts';
import type { PreviewDiffHunk } from '../preview/preview-document-diff.ts';
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

type UnchangedFile = {
    readonly path: string;
    readonly sizeBytes: number;
    readonly isExecutable: boolean;
};

type ModifiedFileContentChange =
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

type PackageReleaseDiffState = 'changed' | 'first-publish' | 'unchanged';

export type PackageReleaseDiff = {
    readonly name: string;
    readonly state: PackageReleaseDiffState;
    readonly versionTransition: string;
    readonly previousVersionLabel: string;
    readonly files: FileSetDiff;
    readonly diagnostics: PackageReport;
};

export type PackageReleaseDiffStateView = Pick<PackageReleaseDiff, 'files' | 'state'>;

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

type BothPair = {
    readonly kind: 'both';
    readonly path: string;
    readonly previous: FileDescription;
    readonly current: FileDescription;
};

type FilePair =
    | BothPair
    | { readonly kind: 'current-only'; readonly current: FileDescription }
    | { readonly kind: 'previous-only'; readonly previous: FileDescription };

function pairsByPath(
    previousIndex: ReadonlyMap<string, FileDescription>,
    newIndex: ReadonlyMap<string, FileDescription>
): readonly FilePair[] {
    const allPaths = new Set<string>([...previousIndex.keys(), ...newIndex.keys()]);
    const pairs: FilePair[] = [];
    for (const path of allPaths) {
        const previous = previousIndex.get(path);
        const current = newIndex.get(path);
        if (previous !== undefined && current !== undefined) {
            pairs.push({ kind: 'both', path, previous, current });
        } else if (previous !== undefined) {
            pairs.push({ kind: 'previous-only', previous });
        } else if (current !== undefined) {
            pairs.push({ kind: 'current-only', current });
        }
    }
    return pairs;
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

function appendBothSidedPair(
    buckets: FileSetDiffBuckets,
    path: string,
    previous: FileDescription,
    current: FileDescription
): void {
    if (isEqual(previous, current, path)) {
        buckets.unchanged.push(toUnchanged(current));
        return;
    }
    buckets.modified.push(toModified(previous, current));
}

function appendPairToBuckets(buckets: FileSetDiffBuckets, pair: FilePair): void {
    if (pair.kind === 'previous-only') {
        buckets.removed.push(toRemoved(pair.previous));
        return;
    }
    if (pair.kind === 'current-only') {
        buckets.added.push(toAdded(pair.current));
        return;
    }
    appendBothSidedPair(buckets, pair.path, pair.previous, pair.current);
}

export function buildFileSetDiff(
    previousFiles: readonly FileDescription[],
    newFiles: readonly FileDescription[]
): FileSetDiff {
    const previousIndex = indexByPath(previousFiles);
    const newIndex = indexByPath(newFiles);
    const buckets: FileSetDiffBuckets = { added: [], removed: [], modified: [], unchanged: [] };
    for (const pair of pairsByPath(previousIndex, newIndex)) {
        appendPairToBuckets(buckets, pair);
    }
    return buckets;
}
