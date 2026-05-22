import type { FileDescription } from '../file-manager/file-description.ts';
import type { FileManager } from '../file-manager/file-manager.ts';
import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.ts';
import type { ArtifactSourcePackage } from '../published-package/published-package.ts';
import { inspectArtifactSizes } from '../report/inspectors/inspect-artifact-sizes.ts';
import type { TarballBuilder } from '../tar/tarball-builder.ts';
import { applyPrefixToVendorEntry, type VendorEntry } from '../vendor-materializer/vendor-entry.ts';
import type { ZipBuilder } from '../zip/zip-builder.ts';
import { collectArtifactContents, describeArtifactsForReport } from './content-collection.ts';
import { writeArtifactsToFolder } from './folder-writer.ts';

export type ArtifactsBuilderDependencies = {
    readonly fileManager: FileManager;
    readonly tarballBuilder: TarballBuilder;
    readonly zipBuilder: ZipBuilder;
    readonly progressBroadcaster: ProgressBroadcastProvider;
};

type TarballArtifact = {
    readonly tarData: Buffer;
};

type ZipArtifact = {
    readonly zipData: Buffer;
};

export type ArtifactsBuilder = {
    collectContents: (
        bundle: ArtifactSourcePackage,
        prefix?: string,
        extraFiles?: readonly FileDescription[]
    ) => readonly FileDescription[];
    buildTarball: (
        bundle: ArtifactSourcePackage,
        extraFiles?: readonly FileDescription[],
        vendorEntries?: readonly VendorEntry[]
    ) => Promise<TarballArtifact>;
    buildZip: (
        bundle: ArtifactSourcePackage,
        extraFiles?: readonly FileDescription[],
        vendorEntries?: readonly VendorEntry[]
    ) => Promise<ZipArtifact>;
    buildFolder: (
        bundle: ArtifactSourcePackage,
        targetFolder: string,
        extraFiles?: readonly FileDescription[],
        vendorEntries?: readonly VendorEntry[]
    ) => Promise<void>;
};

export function createArtifactsBuilder(dependencies: ArtifactsBuilderDependencies): ArtifactsBuilder {
    const { fileManager, tarballBuilder, zipBuilder, progressBroadcaster } = dependencies;

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

        async buildTarball(bundle, extraFiles, vendorEntries = []) {
            const contents = collectContents(bundle, 'package', extraFiles);
            const prefixedVendor = vendorEntries.map((entry) => {
                return applyPrefixToVendorEntry('package', entry);
            });
            const tarData = await tarballBuilder.build(contents, prefixedVendor);
            return { tarData };
        },

        async buildZip(bundle, extraFiles, vendorEntries = []) {
            const contents = collectContents(bundle, undefined, extraFiles);
            const zipData = await zipBuilder.build(contents, vendorEntries);
            return { zipData };
        },

        async buildFolder(bundle, targetFolder, extraFiles, vendorEntries = []) {
            const contents = collectContents(bundle, undefined, extraFiles);
            await writeArtifactsToFolder(fileManager, targetFolder, contents, vendorEntries);
        }
    };
}
