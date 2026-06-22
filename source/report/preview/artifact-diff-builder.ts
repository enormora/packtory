import { structuredPatch } from 'diff';
import type { ArtifactEntry } from '../../progress/progress-broadcaster.ts';
import type { BundleArtifactIndex } from './bundle-artifact-index.ts';
import { isDiffableArtifact, toPreviewDiffHunk, type PreviewDiffHunk } from './preview-document-diff.ts';

const diffContextLines = 3;
const diffHunkLimit = 2;

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
    const patchFile = structuredPatch(
        artifact.path,
        artifact.path,
        originalContent,
        finalArtifact.content,
        undefined,
        undefined,
        { context: diffContextLines }
    );
    return patchFile.hunks.slice(0, diffHunkLimit).map(toPreviewDiffHunk);
}
