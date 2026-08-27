import type { BundleEmitter } from '../bundle-emitter/emitter.ts';
import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.ts';
import type { SbomFileBuilder } from '../sbom/sbom-file.ts';
import type { VersionManager } from '../version-manager/manager.ts';

export type PublishDependencies = {
    readonly bundleEmitter: BundleEmitter;
    readonly fileManager: {
        readonly checkReadability: (fileOrFolderPath: string) => Promise<{ readonly isReadable: boolean; }>;
        readonly readFile: (filePath: string) => Promise<string>;
    };
    readonly progressBroadcaster: ProgressBroadcastProvider;
    readonly repositoryFolder: string;
    readonly sbomFileBuilder: SbomFileBuilder;
    readonly versionManager: VersionManager;
};
