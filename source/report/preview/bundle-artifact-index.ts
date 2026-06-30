import { packageManifestFilePath } from '../../common/package-layout.ts';
import type { BuildAndPublishResult } from '../../packtory/package-processor.ts';

type FinalArtifactContent = {
    readonly content: string;
    readonly sourcePath?: string | undefined;
};

export type BundleArtifactIndex = ReadonlyMap<string, ReadonlyMap<string, FinalArtifactContent>>;

export function buildBundleArtifactIndex(results: readonly BuildAndPublishResult[]): BundleArtifactIndex {
    return new Map(
        results.map(function (result) {
            const entries = new Map<string, FinalArtifactContent>([
                [ packageManifestFilePath, { content: result.bundle.manifestFile.content } ]
            ]);
            for (const entry of result.bundle.contents) {
                entries.set(entry.fileDescription.targetFilePath, {
                    content: entry.fileDescription.content,
                    sourcePath: entry.fileDescription.sourceFilePath
                });
            }
            return [ result.bundle.name, entries ] as const;
        })
    );
}
