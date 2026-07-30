import { checkPackage, Package } from '@arethetypeswrong/core';
import {
    problemAffectsEntrypointResolution,
    problemAffectsResolutionKind,
    problemKindInfo
} from '@arethetypeswrong/core/problems';
import { Project } from 'ts-morph';
import { createCheckRunner, type CheckRunner } from '../checks/check-runner.ts';
import { createAllRules } from '../checks/rules/registry.ts';
import { createDeclarationIntegritySummarizer } from '../checks/rules/type-script-declaration-integrity.ts';
import { createDeclarationProjectFactory } from '../checks/rules/type-script-declaration-project.ts';
import { createPackageResolutionAnalyzer } from '../checks/rules/type-script-package-resolution.ts';
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

function buildCheckRunner(): CheckRunner {
    const rules = createAllRules({
        analyzePackageResolution: createPackageResolutionAnalyzer({
            Package,
            checkPackage,
            problemKindInfo,
            problemAffectsResolutionKind,
            problemAffectsEntrypointResolution
        }),
        summarizeDeclarationIntegrity: createDeclarationIntegritySummarizer({
            createDeclarationProjects: createDeclarationProjectFactory({ Project })
        })
    });

    return createCheckRunner({ rules });
}

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
            runChecks: buildCheckRunner(),
            packEmitter: parts.packEmitter,
            vendorMaterializer: parts.vendorMaterializer,
            readCurrentGitHead: parts.readCurrentGitHead,
            resolveVersionSource: options.resolveVersionSource
        }),
        progressBroadcaster: parts.progressBroadcaster
    };
}
