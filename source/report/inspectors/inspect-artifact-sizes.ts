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

function inferArtifactStatus(sourcePath: string | undefined, rewritten: boolean): ArtifactEntry['status'] {
    if (sourcePath === undefined) {
        return 'generated';
    }
    if (rewritten) {
        return 'changed';
    }
    return 'unchanged';
}

export function inspectArtifactSizes(contents: readonly ArtifactDescriptor[]): readonly ArtifactEntry[] {
    return contents.map((entry) => {
        const sourcePath = 'sourceFilePath' in entry ? entry.sourceFilePath : undefined;
        const rewritten = entry.isSubstituted === true;
        const sizeBytes = Buffer.byteLength(entry.content);
        const kind = inferArtifactKind(entry.filePath);
        const status = inferArtifactStatus(sourcePath, rewritten);
        const badges: ArtifactEntry['badges'] = rewritten ? ['import-path-rewrite'] : [];

        if (sourcePath === undefined) {
            return { path: entry.filePath, sizeBytes, kind, status, badges };
        }

        return { path: entry.filePath, sizeBytes, kind, sourcePath, status, badges };
    });
}
