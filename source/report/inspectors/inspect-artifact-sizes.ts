import type { FileDescription } from '../../file-manager/file-description.ts';
import type { ArtifactEntry } from '../../progress/progress-broadcaster.ts';

function inferArtifactKind(filePath: string): ArtifactEntry['kind'] {
    if (filePath === 'package.json' || filePath.endsWith('/package.json')) {
        return 'manifest';
    }
    if (filePath.endsWith('.sbom.json') || filePath.endsWith('.cdx.json')) {
        return 'sbom';
    }
    if (/\.(?:cjs|d\.[cm]ts|jsx?|map|mjs|tsx?)$/.test(filePath)) {
        return 'source';
    }
    return 'additional';
}

type ArtifactDescriptor = FileDescription & {
    readonly sourceFilePath?: string | undefined;
    readonly isSubstituted?: boolean | undefined;
};

export function inspectArtifactSizes(contents: readonly ArtifactDescriptor[]): readonly ArtifactEntry[] {
    return contents.map((entry) => {
        const sourcePath = 'sourceFilePath' in entry ? entry.sourceFilePath : undefined;
        const rewritten = entry.isSubstituted === true;
        let status: ArtifactEntry['status'] = 'unchanged';
        if (sourcePath === undefined) {
            status = 'generated';
        } else if (rewritten) {
            status = 'changed';
        }
        return {
            path: entry.filePath,
            sizeBytes: Buffer.byteLength(entry.content),
            kind: inferArtifactKind(entry.filePath),
            ...(sourcePath === undefined ? {} : { sourcePath }),
            status,
            badges: rewritten ? ['import-path-rewrite'] : []
        };
    });
}
