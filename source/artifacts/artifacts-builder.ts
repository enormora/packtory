import path from 'node:path';
import ssri from 'ssri';
import type { FileDescription } from '../file-manager/file-description.ts';
import type { FileManager } from '../file-manager/file-manager.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import type { TarballBuilder } from '../tar/tarball-builder.ts';

export type ArtifactsBuilderDependencies = {
    readonly fileManager: FileManager;
    readonly tarballBuilder: TarballBuilder;
};

export type TarballArtifact = {
    readonly tarData: Buffer;
    readonly shasum: string;
};

export type ArtifactsBuilder = {
    collectContents: (
        bundle: VersionedBundleWithManifest,
        prefix?: string,
        extraFiles?: readonly FileDescription[]
    ) => readonly FileDescription[];
    buildTarball: (
        bundle: VersionedBundleWithManifest,
        extraFiles?: readonly FileDescription[]
    ) => Promise<TarballArtifact>;
    buildFolder: (
        bundle: VersionedBundleWithManifest,
        targetFolder: string,
        extraFiles?: readonly FileDescription[]
    ) => Promise<void>;
};

export function createArtifactsBuilder(artifactsBuilderDependencies: ArtifactsBuilderDependencies): ArtifactsBuilder {
    const { fileManager, tarballBuilder } = artifactsBuilderDependencies;

    function applyPrefix(filePath: string, prefix: string | undefined): string {
        return prefix === undefined ? filePath : path.join(prefix, filePath);
    }

    function collectContents(
        bundle: VersionedBundleWithManifest,
        prefix?: string,
        extraFiles: readonly FileDescription[] = []
    ): readonly FileDescription[] {
        const artifactContents: FileDescription[] = [
            {
                ...bundle.manifestFile,
                filePath: applyPrefix(bundle.manifestFile.filePath, prefix)
            }
        ];

        for (const entry of bundle.contents) {
            artifactContents.push({
                filePath: applyPrefix(entry.fileDescription.targetFilePath, prefix),
                content: entry.fileDescription.content,
                isExecutable: entry.fileDescription.isExecutable
            });
        }

        for (const extraFile of extraFiles) {
            artifactContents.push({
                filePath: applyPrefix(extraFile.filePath, prefix),
                content: extraFile.content,
                isExecutable: extraFile.isExecutable
            });
        }

        return artifactContents;
    }

    return {
        collectContents,

        async buildTarball(bundle, extraFiles) {
            const contents = collectContents(bundle, 'package', extraFiles);
            const tarData = await tarballBuilder.build(contents);

            return {
                shasum: ssri.fromData(tarData, { algorithms: ['sha1'] }).hexDigest(),
                tarData
            };
        },

        async buildFolder(bundle, targetFolder, extraFiles) {
            const readability = await fileManager.checkReadability(targetFolder);

            if (readability.isReadable) {
                throw new Error(`Folder ${targetFolder} already exists`);
            }

            const contents = collectContents(bundle, undefined, extraFiles);

            for (const entry of contents) {
                const targetFilePath = path.join(targetFolder, entry.filePath);

                await fileManager.writeFile(targetFilePath, entry.content);
            }
        }
    };
}
