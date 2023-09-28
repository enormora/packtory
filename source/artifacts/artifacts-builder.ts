import path from 'node:path';
import ssri from 'ssri';
import type { BundleContent, BundleDescription } from '../bundler/bundle-description.js';
import type { FileManager } from './file-manager.js';
import { createTarballBuilder } from './tarball-builder.js';

export type ArtifactsBuilderDependencies = {
    readonly fileManager: FileManager;
};

export type TarballArtifact = {
    readonly tarData: Buffer;
    readonly shasum: string;
};

export type ArtifactsBuilder = {
    buildTarball(bundle: BundleDescription): Promise<TarballArtifact>;
    buildFolder(bundle: BundleDescription, targetFolder: string): Promise<void>;
};

function compareBundleContentTargetPath(first: Readonly<BundleContent>, second: Readonly<BundleContent>): -1 | 0 | 1 {
    if (first.targetFilePath < second.targetFilePath) {
        return -1;
    }
    if (first.targetFilePath > second.targetFilePath) {
        return 1;
    }
    return 0;
}

export function createArtifactsBuilder(artifactsBuilderDependencies: ArtifactsBuilderDependencies): ArtifactsBuilder {
    const { fileManager } = artifactsBuilderDependencies;

    return {
        async buildTarball(bundle) {
            const tarballBuilder = createTarballBuilder();
            const sortedContents = Array.from(bundle.contents).sort(compareBundleContentTargetPath);

            for (const entry of sortedContents) {
                const targetFilePath = path.join('package', entry.targetFilePath);

                if (entry.kind === 'reference') {
                    const content = await fileManager.readFile(entry.sourceFilePath);
                    tarballBuilder.addFile(targetFilePath, content);
                } else {
                    tarballBuilder.addFile(targetFilePath, entry.source);
                }
            }

            const tarData = await tarballBuilder.build();

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
