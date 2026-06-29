import { isTextDiffablePath } from '../../common/code-files.ts';
import { areFileDescriptionEqual } from '../../file-manager/equal.ts';
import { fileDescriptionByPath } from '../../file-manager/file-description-by-path.ts';
import type { FileDescription } from '../../file-manager/file-description.ts';
import type { PreviewDiffHunk } from '../preview/preview-document-diff.ts';
import { buildFileHunks } from './file-hunks.ts';

export const modifiedFileContentChangeKind = {
    binary: 'binary',
    modeOnly: 'mode-only',
    text: 'text'
} as const;

export const packageReleaseDiffState = {
    changed: 'changed',
    firstPublish: 'first-publish',
    unchanged: 'unchanged'
} as const;

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

type BinaryContentChange = { readonly kind: typeof modifiedFileContentChangeKind.binary; };
type ModeOnlyContentChange = { readonly kind: typeof modifiedFileContentChangeKind.modeOnly; };
type TextContentChange = {
    readonly kind: typeof modifiedFileContentChangeKind.text;
    readonly hunks: readonly PreviewDiffHunk[];
};
type ModifiedFileContentChanges = readonly [
    BinaryContentChange,
    ModeOnlyContentChange,
    TextContentChange
];
type ModifiedFileContentChange = ModifiedFileContentChanges[number];

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

type PackageReleaseDiffState = (typeof packageReleaseDiffState)[keyof typeof packageReleaseDiffState];

export type PackageReleaseDiff = {
    readonly name: string;
    readonly state: PackageReleaseDiffState;
    readonly versionTransition: string;
    readonly previousVersionLabel: string;
    readonly files: FileSetDiff;
};

export type PackageReleaseDiffStateView = Pick<PackageReleaseDiff, 'files' | 'state'>;

function sizeOf(content: string): number {
    return Buffer.byteLength(content);
}

function classifyContentChange(previous: FileDescription, current: FileDescription): ModifiedFileContentChange {
    if (previous.content === current.content) {
        return { kind: modifiedFileContentChangeKind.modeOnly };
    }
    if (!isTextDiffablePath(current.filePath)) {
        return { kind: modifiedFileContentChangeKind.binary };
    }
    return {
        kind: modifiedFileContentChangeKind.text,
        hunks: buildFileHunks(current.filePath, previous.content, current.content)
    };
}

function toSizedFile(file: FileDescription): AddedFile {
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

function isEqual(previous: FileDescription, current: FileDescription, path: string): boolean {
    return areFileDescriptionEqual({ ...previous, filePath: path }, { ...current, filePath: path });
}

type ComparedFileCollectors = {
    readonly removed: { readonly push: (file: RemovedFile) => unknown; };
    readonly modified: { readonly push: (file: ModifiedFile) => unknown; };
    readonly unchanged: { readonly push: (file: UnchangedFile) => unknown; };
};

type FileSetDiffBuckets = ComparedFileCollectors & {
    readonly added: { readonly push: (file: AddedFile) => unknown; };
    readonly toDiff: () => FileSetDiff;
};

function createFileSetDiffBuckets(): FileSetDiffBuckets {
    const added: AddedFile[] = [];
    const removed: RemovedFile[] = [];
    const modified: ModifiedFile[] = [];
    const unchanged: UnchangedFile[] = [];

    return {
        added,
        removed,
        modified,
        unchanged,
        toDiff() {
            return { added, removed, modified, unchanged };
        }
    };
}

function appendComparedFile(
    collectors: ComparedFileCollectors,
    path: string,
    previous: FileDescription,
    current: FileDescription | undefined
): void {
    if (current === undefined) {
        collectors.removed.push(toSizedFile(previous));
        return;
    }

    if (isEqual(previous, current, path)) {
        collectors.unchanged.push(toSizedFile(current));
        return;
    }

    collectors.modified.push(toModified(previous, current));
}

export function buildFileSetDiff(
    previousFiles: readonly FileDescription[],
    newFiles: readonly FileDescription[]
): FileSetDiff {
    const previousIndex = fileDescriptionByPath(previousFiles);
    const newIndex = fileDescriptionByPath(newFiles);
    const buckets = createFileSetDiffBuckets();

    for (const [ previousPath, previous ] of previousIndex) {
        appendComparedFile(buckets, previousPath, previous, newIndex.get(previousPath));
    }
    for (const [ currentPath, current ] of newIndex) {
        if (!previousIndex.has(currentPath)) {
            buckets.added.push(toSizedFile(current));
        }
    }
    return buckets.toDiff();
}
