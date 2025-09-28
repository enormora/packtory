import path from 'node:path';
import ssri from 'ssri';
import type { TarballBuilder } from '../tar/tarball-builder.js';
import type { FileDescription } from '../file-manager/file-description.js';
import type { FileManager } from '../file-manager/file-manager.js';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.js';

export type ArtifactsBuilderDependencies = {
    readonly fileManager: FileManager;
    readonly tarballBuilder: TarballBuilder;
};

export type TarballArtifact = {
    readonly tarData: Buffer;
    readonly shasum: string;
};

export type ArtifactsBuilder = {
    collectContents: (bundle: VersionedBundleWithManifest, prefix?: string) => readonly FileDescription[];
    buildTarball: (bundle: VersionedBundleWithManifest) => Promise<TarballArtifact>;
    buildFolder: (bundle: VersionedBundleWithManifest, targetFolder: string) => Promise<void>;
};

export function createArtifactsBuilder(artifactsBuilderDependencies: ArtifactsBuilderDependencies): ArtifactsBuilder {
    const { fileManager, tarballBuilder } = artifactsBuilderDependencies;

    function collectContents(bundle: VersionedBundleWithManifest, prefix?: string): readonly FileDescription[] {
        const artifactContents: FileDescription[] = [
            {
                ...bundle.manifestFile,
                filePath:
                    prefix === undefined
                        ? bundle.manifestFile.filePath
                        : path.join(prefix, bundle.manifestFile.filePath)
            }
        ];

        for (const entry of bundle.contents) {
            const targetFilePath =
                prefix === undefined
                    ? entry.fileDescription.targetFilePath
                    : path.join(prefix, entry.fileDescription.targetFilePath);
            artifactContents.push({
                filePath: targetFilePath,
                content: entry.fileDescription.content,
                isExecutable: entry.fileDescription.isExecutable
            });
        }

        return artifactContents;
    }

    return {
        collectContents,

        async buildTarball(bundle) {
            const contents = collectContents(bundle, 'package');
            const tarData = await tarballBuilder.build(contents);

            return {
                shasum: ssri.fromData(tarData, { algorithms: ['sha1'] }).hexDigest(),
                tarData
            };
        },

        async buildFolder(bundle, targetFolder) {
            const readability = await fileManager.checkReadability(targetFolder);

            if (readability.isReadable) {
                throw new Error(`Folder ${targetFolder} already exists`);
            }

            const contents = collectContents(bundle);

            for (const entry of contents) {
                const targetFilePath = path.join(targetFolder, entry.filePath);

                await fileManager.writeFile(targetFilePath, entry.content);
            }
        }
    };
}
