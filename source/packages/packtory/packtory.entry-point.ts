import type { PacktoryConfig as PublicPacktoryConfig } from '../../config/config.ts';
import {
    createPacktory,
    type BuildAndPublishAllOptions as PublicBuildAndPublishAllOptions,
    type BuildReport as PublicBuildReport,
    type PackOutcome as PublicPackOutcome,
    type PackPublicOptions as PublicPackPublicOptions,
    type PackResult as PublicPackResult,
    type PublishAllOutcome as PublicPublishAllOutcome,
    type PublishAllResult as PublicPublishAllResult,
    type ReleaseDiffAllOutcome as PublicReleaseDiffAllOutcome,
    type ReleaseDiffAllResult as PublicReleaseDiffAllResult,
    type ResolveAndLinkAllOptions as PublicResolveAndLinkAllOptions,
    type ResolveAndLinkAllOutcome as PublicResolveAndLinkAllOutcome,
    type ResolveAndLinkAllResult as PublicResolveAndLinkAllResult,
    type ResolveAndLinkFailure as PublicResolveAndLinkFailure
} from '../../packtory/packtory.ts';
import { createScheduler } from '../../packtory/scheduler.ts';
import type { ResolvedPackage as PublicResolvedPackage } from '../../packtory/resolved-package.ts';
import { readCiEnvironment } from '../../bundle-emitter/repository-coherence.ts';
import type { PublicProgressBroadcastConsumer } from '../../progress/progress-broadcaster.ts';
import { buildPackageProcessorComposition } from '../package-processor.composition.ts';

const { packageProcessor, progressBroadcaster, deadCodeEliminator, artifactsBuilder, versionManager, packEmitter } =
    buildPackageProcessorComposition({
        ciEnvironment: readCiEnvironment(process.env)
    });

const scheduler = createScheduler({
    progressBroadcastProvider: progressBroadcaster.provider
});

const packtory = createPacktory({
    scheduler,
    packageProcessor,
    deadCodeEliminator,
    progressBroadcaster,
    artifactsBuilder,
    versionManager,
    packEmitter
});

export const { buildAndPublishAll, diffAgainstLatestPublished, resolveAndLinkAll, packPackage } = packtory;
export const progressBroadcastConsumer: PublicProgressBroadcastConsumer = progressBroadcaster.consumer;

export type PacktoryConfig = PublicPacktoryConfig;
export type BuildAndPublishAllOptions = PublicBuildAndPublishAllOptions;
export type BuildReport = PublicBuildReport;
export type PackOutcome = PublicPackOutcome;
export type PackPublicOptions = PublicPackPublicOptions;
export type PackResult = PublicPackResult;
export type PublishAllOutcome = PublicPublishAllOutcome;
export type PublishAllResult = PublicPublishAllResult;
export type ReleaseDiffAllOutcome = PublicReleaseDiffAllOutcome;
export type ReleaseDiffAllResult = PublicReleaseDiffAllResult;
export type ResolveAndLinkAllOptions = PublicResolveAndLinkAllOptions;
export type ResolveAndLinkAllOutcome = PublicResolveAndLinkAllOutcome;
export type ResolveAndLinkAllResult = PublicResolveAndLinkAllResult;
export type ResolveAndLinkFailure = PublicResolveAndLinkFailure;
export type ResolvedPackage = PublicResolvedPackage;
