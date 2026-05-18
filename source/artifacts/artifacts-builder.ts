import type { FileDescription } from '../file-manager/file-description.ts';
import type { FileManager } from '../file-manager/file-manager.ts';
import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.ts';
import type { ArtifactSourcePackage } from '../published-package/published-package.ts';
import { inspectArtifactSizes } from '../report/inspectors/inspect-artifact-sizes.ts';
import type { TarballBuilder } from '../tar/tarball-builder.ts';
import { collectArtifactContents, describeArtifactsForReport } from './content-collection.ts';
import { writeArtifactsToFolder } from './folder-writer.ts';

export type ArtifactsBuilderDependencies = {
    readonly fileManager: FileManager;
    readonly tarballBuilder: TarballBuilder;
    readonly progressBroadcaster: ProgressBroadcastProvider;
};

type TarballArtifact = {
    readonly tarData: Buffer;
};

export type ArtifactsBuilder = {
    collectContents: (
        bundle: ArtifactSourcePackage,
        prefix?: string,
        extraFiles?: readonly FileDescription[]
    ) => readonly FileDescription[];
    buildTarball: (bundle: ArtifactSourcePackage, extraFiles?: readonly FileDescription[]) => Promise<TarballArtifact>;
    buildFolder: (
        bundle: ArtifactSourcePackage,
        targetFolder: string,
        extraFiles?: readonly FileDescription[]
    ) => Promise<void>;
};

export function createArtifactsBuilder(dependencies: ArtifactsBuilderDependencies): ArtifactsBuilder {
    const { fileManager, tarballBuilder, progressBroadcaster } = dependencies;

    function collectContents(
        bundle: ArtifactSourcePackage,
        prefix?: string,
        extraFiles: readonly FileDescription[] = []
    ): readonly FileDescription[] {
        const artifactContents = collectArtifactContents(bundle, prefix, extraFiles);

        if (progressBroadcaster.hasSubscribers('artifactsCollected')) {
            progressBroadcaster.emit('artifactsCollected', {
                packageName: bundle.name,
                entries: inspectArtifactSizes(describeArtifactsForReport(bundle, prefix, extraFiles))
            });
        }

        return artifactContents;
    }

    return {
        collectContents,

        async buildTarball(bundle, extraFiles) {
            const contents = collectContents(bundle, 'package', extraFiles);
            const tarData = await tarballBuilder.build(contents);
            return { tarData };
        },

        async buildFolder(bundle, targetFolder, extraFiles) {
            const contents = collectContents(bundle, undefined, extraFiles);
            await writeArtifactsToFolder(fileManager, targetFolder, contents);
        }
    };
}
