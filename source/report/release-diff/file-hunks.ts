import { createStructuredPatch } from '../../common/typed-diff.ts';
import { toDiffLineType } from '../preview/preview-document-diff.ts';
import type { PreviewDiffHunk } from '../preview/artifact-diff-builder.ts';

const diffContextLines = 3;

type StructuredHunk = ReturnType<typeof createStructuredPatch>['hunks'][number];

function toPreviewDiffHunk(hunk: StructuredHunk): PreviewDiffHunk {
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

export function buildFileHunks(path: string, previousContent: string, newContent: string): readonly PreviewDiffHunk[] {
    const patch = createStructuredPatch(path, path, previousContent, newContent, undefined, undefined, {
        context: diffContextLines
    });
    return patch.hunks.map(toPreviewDiffHunk);
}
