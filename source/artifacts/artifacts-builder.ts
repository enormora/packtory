import path from 'node:path';
import ssri from 'ssri';
import type { BundleDescription } from '../bundler/bundle-description.js';
import type { TarballBuilder } from '../tar/tarball-builder.js';
import type { FileDescription } from '../file-description/file-description.js';
import type { FileManager } from './file-manager.js';

export type ArtifactsBuilderDependencies = {
    readonly fileManager: FileManager;
    readonly tarballBuilder: TarballBuilder;
};

export type TarballArtifact = {
    readonly tarData: Buffer;
    readonly shasum: string;
};

export type ArtifactsBuilder = {
    collectContents(bundle: BundleDescription): Promise<readonly FileDescription[]>;
    buildTarball(bundle: BundleDescription): Promise<TarballArtifact>;
    buildFolder(bundle: BundleDescription, targetFolder: string): Promise<void>;
};

export function createArtifactsBuilder(artifactsBuilderDependencies: ArtifactsBuilderDependencies): ArtifactsBuilder {
    const { fileManager, tarballBuilder } = artifactsBuilderDependencies;

    async function collectContents(bundle: BundleDescription): Promise<readonly FileDescription[]> {
        const artifactContents: FileDescription[] = [];

        for (const entry of bundle.contents) {
            const targetFilePath = path.join('package', entry.targetFilePath);

            if (entry.kind === 'reference') {
                const content = await fileManager.readFile(entry.sourceFilePath);
                artifactContents.push({ filePath: targetFilePath, content });
            } else {
                artifactContents.push({ filePath: targetFilePath, content: entry.source });
            }
        }
        return artifactContents;
    }

    return {
        collectContents,

        async buildTarball(bundle) {
            const contents = await collectContents(bundle);
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

            for (const entry of bundle.contents) {
                const targetFilePath = path.join(targetFolder, entry.targetFilePath);

                await (entry.kind === 'reference'
                    ? fileManager.copyFile(entry.sourceFilePath, targetFilePath)
                    : fileManager.writeFile(targetFilePath, entry.source));
            }
        }
    };
}
