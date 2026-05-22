import type { ArtifactsBuilder } from '../artifacts/artifacts-builder.ts';
import type { FileManager } from '../file-manager/file-manager.ts';
import type { ArtifactSourcePackage } from '../published-package/published-package.ts';

export type PackFormat = 'folder' | 'tar' | 'zip';

type PackOptions = {
    readonly bundle: ArtifactSourcePackage;
    readonly format: PackFormat;
    readonly outputPath: string;
};

export type PackEmitter = {
    pack: (options: PackOptions) => Promise<void>;
};

export type PackEmitterDependencies = {
    readonly artifactsBuilder: Pick<ArtifactsBuilder, 'buildFolder' | 'buildTarball' | 'buildZip'>;
    readonly fileManager: Pick<FileManager, 'writeBinaryFile'>;
};

export function createPackEmitter(dependencies: PackEmitterDependencies): PackEmitter {
    const { artifactsBuilder, fileManager } = dependencies;

    async function packZip(bundle: ArtifactSourcePackage, outputPath: string): Promise<void> {
        const { zipData } = await artifactsBuilder.buildZip(bundle);
        await fileManager.writeBinaryFile(outputPath, zipData);
    }

    async function packTarball(bundle: ArtifactSourcePackage, outputPath: string): Promise<void> {
        const { tarData } = await artifactsBuilder.buildTarball(bundle);
        await fileManager.writeBinaryFile(outputPath, tarData);
    }

    async function packFolder(bundle: ArtifactSourcePackage, outputPath: string): Promise<void> {
        await artifactsBuilder.buildFolder(bundle, outputPath);
    }

    return {
        async pack(options) {
            const { bundle, format, outputPath } = options;
            if (format === 'zip') {
                await packZip(bundle, outputPath);
                return;
            }
            if (format === 'tar') {
                await packTarball(bundle, outputPath);
                return;
            }
            await packFolder(bundle, outputPath);
        }
    };
}
