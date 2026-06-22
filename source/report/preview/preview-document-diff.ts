import type { StructuredPatch } from 'diff';
import { isCodeFile } from '../../common/code-files.ts';
import type { ArtifactEntry } from '../../progress/progress-broadcaster.ts';

export const previewDiffLineType = {
    add: 'add',
    context: 'context',
    remove: 'remove'
} as const;

type PreviewDiffLineType = (typeof previewDiffLineType)[keyof typeof previewDiffLineType];

export type PreviewDiffLine = {
    readonly type: PreviewDiffLineType;
    readonly text: string;
};

export type PreviewDiffHunk = {
    readonly header: string;
    readonly lines: readonly PreviewDiffLine[];
};

type StructuredHunk = StructuredPatch['hunks'][number];

export function isDiffableArtifact(entry: ArtifactEntry): entry is ArtifactEntry & { readonly sourcePath: string } {
    return (
        entry.sourcePath !== undefined &&
        entry.status === 'changed' &&
        entry.kind === 'source' &&
        isCodeFile(entry.path)
    );
}

function toDiffLineType(line: string): PreviewDiffLineType {
    if (line.startsWith('+')) {
        return previewDiffLineType.add;
    }
    if (line.startsWith('-')) {
        return previewDiffLineType.remove;
    }
    return previewDiffLineType.context;
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
