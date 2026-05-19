import type { ArtifactsBuilder } from '../artifacts/artifacts-builder.ts';
import type { FileManager } from '../file-manager/file-manager.ts';
import type { ArtifactSourcePackage } from '../published-package/published-package.ts';
import type { VendorEntry } from '../vendor-materializer/vendor-entry.ts';

export type PackFormat = 'folder' | 'tar' | 'zip';

type PackOptions = {
    readonly bundle: ArtifactSourcePackage;
    readonly format: PackFormat;
    readonly outputPath: string;
    readonly vendorEntries: readonly VendorEntry[];
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

    async function packZip(options: PackOptions): Promise<void> {
        const { zipData } = await artifactsBuilder.buildZip(options.bundle, undefined, options.vendorEntries);
        await fileManager.writeBinaryFile(options.outputPath, zipData);
    }

    async function packTarball(options: PackOptions): Promise<void> {
        const { tarData } = await artifactsBuilder.buildTarball(options.bundle, undefined, options.vendorEntries);
        await fileManager.writeBinaryFile(options.outputPath, tarData);
    }

    async function packFolder(options: PackOptions): Promise<void> {
        await artifactsBuilder.buildFolder(options.bundle, options.outputPath, undefined, options.vendorEntries);
    }

    return {
        async pack(options) {
            if (options.format === 'zip') {
                await packZip(options);
                return;
            }
            if (options.format === 'tar') {
                await packTarball(options);
                return;
            }
            await packFolder(options);
        }
    };
}
