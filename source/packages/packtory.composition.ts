import { createPacktory, type Packtory } from '../packtory/packtory.ts';
import { createScheduler } from '../packtory/scheduler.ts';
import type { ProgressBroadcaster } from '../progress/progress-broadcaster.ts';
import {
    buildPackageProcessorComposition,
    type PackageProcessorCompositionOptions
} from './package-processor.composition.ts';

export type PacktoryComposition = {
    readonly packtory: Packtory;
    readonly progressBroadcaster: ProgressBroadcaster;
};

export function buildPacktoryComposition(options: PackageProcessorCompositionOptions): PacktoryComposition {
    const parts = buildPackageProcessorComposition(options);
    const scheduler = createScheduler({
        progressBroadcastProvider: parts.progressBroadcaster.provider
    });

    return {
        packtory: createPacktory({
            scheduler,
            packageProcessor: parts.packageProcessor,
            deadCodeEliminator: parts.deadCodeEliminator,
            progressBroadcaster: parts.progressBroadcaster,
            artifactsBuilder: parts.artifactsBuilder,
            fileManager: parts.fileManager,
            repositoryFolder: parts.repositoryFolder,
            versionManager: parts.versionManager,
            packEmitter: parts.packEmitter,
            vendorMaterializer: parts.vendorMaterializer,
            readCurrentGitHead: parts.readCurrentGitHead,
            resolveVersionSource: options.resolveVersionSource
        }),
        progressBroadcaster: parts.progressBroadcaster
    };
}
