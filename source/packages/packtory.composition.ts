import { Project } from 'ts-morph';
import { createPacktoryAnalysisIdentityResolver } from '../software-bill-of-materials/tool-version.ts';
import { createPacktory, type Packtory } from '../packtory/packtory.ts';
import { createScheduler } from '../packtory/scheduler.ts';
import type { ProgressBroadcaster } from '../progress/progress-broadcaster.ts';
import { buildCheckRunner } from './check-runner.composition.ts';
import {
    buildPackageProcessorComposition,
    importPackageManifest,
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
            withAnalysisInputs: parts.inputValidator.run,
            scheduler,
            packageProcessor: parts.packageProcessor,
            deadCodeEliminator: parts.deadCodeEliminator,
            inspectSymbols: parts.deadCodeEliminator.inspectSymbols,
            progressBroadcaster: parts.progressBroadcaster,
            artifactsBuilder: parts.artifactsBuilder,
            fileManager: parts.fileManager,
            repositoryFolder: parts.repositoryFolder,
            versionManager: parts.versionManager,
            runChecks: buildCheckRunner({
                repositoryFolder: parts.repositoryFolder,
                fileManager: parts.fileManager,
                inputValidator: parts.inputValidator,
                Project,
                toolIdentity: createPacktoryAnalysisIdentityResolver({ importPackageManifest })
            }),
            packEmitter: parts.packEmitter,
            vendorMaterializer: parts.vendorMaterializer,
            readCurrentGitHead: parts.readCurrentGitHead,
            resolveVersionSource: options.resolveVersionSource
        }),
        progressBroadcaster: parts.progressBroadcaster
    };
}
