import type * as configTypes from '../../config/config.ts';
import { createPacktory } from '../../packtory/packtory.ts';
import { createScheduler } from '../../packtory/scheduler.ts';
import type * as packtoryTypes from '../../packtory/packtory.ts';
import type * as resolvedPackageTypes from '../../packtory/resolved-package.ts';
import { readCiEnvironment } from '../../bundle-emitter/repository-coherence.ts';
import type { PublicProgressBroadcastConsumer } from '../../progress/progress-broadcaster.ts';
import { buildPackageProcessorComposition } from '../package-processor.composition.ts';

const { packageProcessor, progressBroadcaster, deadCodeEliminator } = buildPackageProcessorComposition({
    ciEnvironment: readCiEnvironment(process.env)
});

const scheduler = createScheduler({
    progressBroadcastProvider: progressBroadcaster.provider
});

const packtory = createPacktory({
    scheduler,
    packageProcessor,
    deadCodeEliminator,
    progressBroadcaster
});

export const { buildAndPublishAll, resolveAndLinkAll } = packtory;
export const progressBroadcastConsumer: PublicProgressBroadcastConsumer = progressBroadcaster.consumer;

export type PacktoryConfig = configTypes.PacktoryConfig;
export type PublishAllResult = packtoryTypes.PublishAllResult;
export type PublishAllOutcome = packtoryTypes.PublishAllOutcome;
export type ResolveAndLinkAllResult = packtoryTypes.ResolveAndLinkAllResult;
export type ResolveAndLinkAllOutcome = packtoryTypes.ResolveAndLinkAllOutcome;
export type ResolveAndLinkFailure = packtoryTypes.ResolveAndLinkFailure;
export type ResolvedPackage = resolvedPackageTypes.ResolvedPackage;
export type BuildAndPublishAllOptions = packtoryTypes.BuildAndPublishAllOptions;
export type ResolveAndLinkAllOptions = packtoryTypes.ResolveAndLinkAllOptions;
export type BuildReport = packtoryTypes.BuildReport;
