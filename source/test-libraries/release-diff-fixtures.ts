import { createFactory } from '@enormora/objectory';
import {
    modifiedFileContentChangeKind,
    type ModifiedFile,
    type PackageReleaseDiff
} from '../report/release-diff/file-set-diff.ts';
import {
    previewDiffLineType,
    type PreviewDiffHunk,
    type PreviewDiffLine
} from '../report/preview/preview-document-diff.ts';

type TextContentChange = Extract<
    ModifiedFile['contentChange'],
    { readonly kind: typeof modifiedFileContentChangeKind.text; }
>;

const previewDiffLineFactory = createFactory<PreviewDiffLine>(function () {
    return {
        type: previewDiffLineType.remove,
        text: '-"version": "1.0.0"'
    };
});

const previewDiffHunkFactory = createFactory<PreviewDiffHunk>(function () {
    return {
        header: '@@ -1,1 +1,1 @@',
        lines: previewDiffLineFactory.asArray({ length: 1 })
    };
});

const textContentChangeFactory = createFactory<TextContentChange>(function () {
    return {
        kind: modifiedFileContentChangeKind.text,
        hunks: previewDiffHunkFactory.asArray({ length: 1 })
    };
});

export function createPackageReleaseDiff(overrides: Partial<PackageReleaseDiff> = {}): PackageReleaseDiff {
    return {
        name: 'pkg-a',
        state: 'changed',
        versionTransition: '1.0.0 -> 1.0.1',
        previousVersionLabel: '1.0.0',
        files: { added: [], removed: [], modified: [], unchanged: [] },
        ...overrides
    };
}

export const textModifiedFileFactory = createFactory<ModifiedFile>(function () {
    return {
        path: 'package.json',
        oldSizeBytes: 32,
        newSizeBytes: 35,
        oldIsExecutable: false,
        newIsExecutable: false,
        contentChange: textContentChangeFactory
    };
});
