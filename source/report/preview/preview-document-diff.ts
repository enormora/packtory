import { isCodeFile } from '../../common/code-files.ts';
import type { createStructuredPatch } from '../../common/typed-diff.ts';
import type { ArtifactEntry } from '../../progress/progress-broadcaster.ts';

type PreviewDiffLineType = 'add' | 'context' | 'remove';

export type PreviewDiffLine = {
    readonly type: PreviewDiffLineType;
    readonly text: string;
};

export type PreviewDiffHunk = {
    readonly header: string;
    readonly lines: readonly PreviewDiffLine[];
};

type StructuredHunk = ReturnType<typeof createStructuredPatch>['hunks'][number];

export function isDiffableArtifact(entry: ArtifactEntry): entry is ArtifactEntry & { readonly sourcePath: string } {
    return (
        entry.sourcePath !== undefined &&
        entry.status === 'changed' &&
        entry.kind === 'source' &&
        isCodeFile(entry.path)
    );
}

export function toDiffLineType(line: string): PreviewDiffLineType {
    if (line.startsWith('+')) {
        return 'add';
    }
    if (line.startsWith('-')) {
        return 'remove';
    }
    return 'context';
}

export function toPreviewDiffHunk(hunk: StructuredHunk): PreviewDiffHunk {
    return {
        header: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
        lines: hunk.lines
            .filter((line) => {
                return !line.startsWith('\\');
            })
            .map((line) => {
                return { type: toDiffLineType(line), text: line };
            })
    };
}
