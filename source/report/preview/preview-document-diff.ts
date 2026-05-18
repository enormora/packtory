import { isCodeFile } from '../../common/code-files.ts';
import type { ArtifactEntry } from '../../progress/progress-broadcaster.ts';

type PreviewDiffLineType = 'add' | 'context' | 'remove';

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
