import { structuredPatch } from 'diff';
import { toPreviewDiffHunk, type PreviewDiffHunk } from '../preview/preview-document-diff.ts';

const diffContextLines = 3;

export function buildFileHunks(path: string, previousContent: string, newContent: string): readonly PreviewDiffHunk[] {
    const patch = structuredPatch(path, path, previousContent, newContent, undefined, undefined, {
        context: diffContextLines
    });
    return patch.hunks.map(toPreviewDiffHunk);
}
