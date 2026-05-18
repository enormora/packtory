import { createStructuredPatch } from '../../common/typed-diff.ts';
import type { ArtifactEntry } from '../../progress/progress-broadcaster.ts';
import type { BundleArtifactIndex } from './bundle-artifact-index.ts';
import { isDiffableArtifact, toDiffLineType } from './preview-document-diff.ts';

const diffContextLines = 3;
const diffHunkLimit = 2;

export type PreviewDiffLine = {
    readonly type: 'add' | 'context' | 'remove';
    readonly text: string;
};

export type PreviewDiffHunk = {
    readonly header: string;
    readonly lines: readonly PreviewDiffLine[];
};

function buildHunk(hunk: ReturnType<typeof createStructuredPatch>['hunks'][number]): PreviewDiffHunk {
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

export async function buildDiffForArtifact(
    packageName: string,
    artifact: ArtifactEntry,
    bundleArtifactIndex: BundleArtifactIndex,
    readWorkspaceFile: (filePath: string) => Promise<string>
): Promise<readonly PreviewDiffHunk[] | undefined> {
    if (!isDiffableArtifact(artifact)) {
        return undefined;
    }
    const finalArtifact = bundleArtifactIndex.get(packageName)?.get(artifact.path);
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
        { context: diffContextLines }
    );
    return patchFile.hunks.slice(0, diffHunkLimit).map(buildHunk);
}
