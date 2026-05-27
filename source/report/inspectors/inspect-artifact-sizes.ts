import { isPackageManifestPath } from '../../common/package-layout.ts';
import type { FileDescription } from '../../file-manager/file-description.ts';
import {
    artifactBadge,
    artifactKind,
    artifactStatus,
    type ArtifactEntry
} from '../../progress/progress-broadcaster.ts';

function inferArtifactKind(filePath: string): ArtifactEntry['kind'] {
    if (isPackageManifestPath(filePath)) {
        return artifactKind.manifest;
    }
    if (filePath.endsWith('.sbom.json') || filePath.endsWith('.cdx.json')) {
        return artifactKind.sbom;
    }
    if (/\.(?:cjs|d\.[cm]ts|jsx?|map|mjs|tsx?)$/.test(filePath)) {
        return artifactKind.source;
    }
    return artifactKind.additional;
}

type ArtifactDescriptor = FileDescription & {
    readonly sourceFilePath?: string | undefined;
    readonly isSubstituted?: boolean | undefined;
};

export function inspectArtifactSizes(contents: readonly ArtifactDescriptor[]): readonly ArtifactEntry[] {
    return contents.map((entry) => {
        const sourcePath = 'sourceFilePath' in entry ? entry.sourceFilePath : undefined;
        const rewritten = entry.isSubstituted === true;
        let status: ArtifactEntry['status'] = artifactStatus.unchanged;
        if (sourcePath === undefined) {
            status = artifactStatus.generated;
        } else if (rewritten) {
            status = artifactStatus.changed;
        }
        const artifactEntry: {
            path: string;
            sizeBytes: number;
            kind: ArtifactEntry['kind'];
            status: ArtifactEntry['status'];
            badges: ArtifactEntry['badges'];
            sourcePath?: string;
        } = {
            path: entry.filePath,
            sizeBytes: Buffer.byteLength(entry.content),
            kind: inferArtifactKind(entry.filePath),
            status,
            badges: rewritten ? [artifactBadge.importPathRewrite] : []
        };
        if (sourcePath !== undefined) {
            artifactEntry.sourcePath = sourcePath;
        }
        return artifactEntry;
    });
}
