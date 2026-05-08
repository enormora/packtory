import type * as configTypes from '../../config/config.ts';
import { createPacktory } from '../../packtory/packtory.ts';
import { createScheduler } from '../../packtory/scheduler.ts';
import type * as packtoryTypes from '../../packtory/packtory.ts';
import { readCiEnvironment } from '../../bundle-emitter/repository-coherence.ts';
import { buildPackageProcessorComposition } from '../package-processor.composition.ts';

const { packageProcessor, progressBroadcaster } = buildPackageProcessorComposition({
    ciEnvironment: readCiEnvironment(process.env)
});

const scheduler = createScheduler({
    progressBroadcastProvider: progressBroadcaster.provider
});

const packtory = createPacktory({
    scheduler,
    packageProcessor
});

export const { buildAndPublishAll, resolveAndLinkAll } = packtory;
export const progressBroadcastConsumer = progressBroadcaster.consumer;

export type PacktoryConfig = configTypes.PacktoryConfig;
export type PublishAllResult = packtoryTypes.PublishAllResult;
export type ResolveAndLinkAllResult = packtoryTypes.ResolveAndLinkAllResult;
export type ResolveAndLinkFailure = packtoryTypes.ResolveAndLinkFailure;
export type ResolvedPackage = packtoryTypes.ResolvedPackage;
