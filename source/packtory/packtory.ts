/* eslint-disable import/max-dependencies -- the packtory facade legitimately stitches together validation, resolve+link, publish, release-diff, and report attachment */
import { Result } from 'true-myth';
import type { ArtifactsBuilder } from '../artifacts/artifacts-builder.ts';
import { validateConfig, validateConfigWithoutRegistry, type ValidConfigResult } from '../config/validation.ts';
import type { DeadCodeEliminator } from '../dead-code-eliminator/analyzed-bundle.ts';
import { createDiffAgainstLatestPublishedValidated } from './packtory-release-diff.ts';
import { attachAggregator, emitEffectiveConfigPerPackage, maybeAttachAggregator } from './report-attachment.ts';
import { createResolveAndLinkAllValidated } from './packtory-resolve.ts';
import { createRunBuildAndPublishValidated } from './packtory-publish.ts';
import {
    configError,
    createPublishAllOutcome,
    createReleaseDiffAllOutcome,
    createResolveAndLinkAllOutcome,
    type BuildAndPublishAllOptions as BuildAndPublishAllOptionsBase,
    type BuildReport as BuildReportBase,
    type Packtory as PacktoryBase,
    type ProgressBroadcaster,
    type PublishAllOutcome as PublishAllOutcomeBase,
    type PublishAllResult as PublishAllResultBase,
    type ReleaseDiffAllOutcome as ReleaseDiffAllOutcomeBase,
    type ReleaseDiffAllResult as ReleaseDiffAllResultBase,
    type ResolveAndLinkFailure as ResolveAndLinkFailureBase,
    type ResolveAndLinkAllOutcome as ResolveAndLinkAllOutcomeBase,
    type ResolveAndLinkAllResult as ResolveAndLinkAllResultBase,
    type ResolveAndLinkAllOptions as ResolveAndLinkAllOptionsBase
} from './packtory-results.ts';
import type { PackageProcessor } from './package-processor.ts';
import type { Scheduler as PacktoryScheduler } from './scheduler.ts';

export type BuildAndPublishAllOptions = BuildAndPublishAllOptionsBase;
export type ResolveAndLinkAllOptions = ResolveAndLinkAllOptionsBase;
export type BuildReport = BuildReportBase;
export type PublishAllOutcome = PublishAllOutcomeBase;
export type ResolveAndLinkAllOutcome = ResolveAndLinkAllOutcomeBase;
export type ReleaseDiffAllOutcome = ReleaseDiffAllOutcomeBase;
export type PublishAllResult = PublishAllResultBase;
export type ResolveAndLinkAllResult = ResolveAndLinkAllResultBase;
export type ReleaseDiffAllResult = ReleaseDiffAllResultBase;
export type ResolveAndLinkFailure = ResolveAndLinkFailureBase;
export type Packtory = PacktoryBase;

type PacktoryDependencies = {
    readonly packageProcessor: PackageProcessor;
    readonly scheduler: PacktoryScheduler;
    readonly deadCodeEliminator: DeadCodeEliminator;
    readonly progressBroadcaster: ProgressBroadcaster;
    readonly artifactsBuilder: Pick<ArtifactsBuilder, 'collectContents'>;
};

export function createPacktory(dependencies: PacktoryDependencies): Packtory {
    const { progressBroadcaster } = dependencies;
    const resolveAndLinkAllValidated = createResolveAndLinkAllValidated(dependencies);
    const runBuildAndPublishValidated = createRunBuildAndPublishValidated(dependencies);
    const diffAgainstLatestPublishedValidated = createDiffAgainstLatestPublishedValidated(dependencies);

    async function resolveAndLinkAllPublic(
        config: unknown,
        options?: ResolveAndLinkAllOptions
    ): Promise<ResolveAndLinkAllOutcome> {
        const reporting = maybeAttachAggregator(progressBroadcaster, options?.collectReport);
        try {
            const validation = validateConfigWithoutRegistry(config);
            if (validation.isErr) {
                return createResolveAndLinkAllOutcome(Result.err(configError(validation.error)), reporting.getReport);
            }

            const result = await resolveAndLinkAllValidated(validation.value);
            if (result.isErr) {
                return createResolveAndLinkAllOutcome(Result.err(result.error), reporting.getReport);
            }
            return createResolveAndLinkAllOutcome(Result.ok(result.value), reporting.getReport);
        } finally {
            reporting.dispose();
        }
    }

    async function runBuildAndPublish(
        validated: ValidConfigResult,
        options: BuildAndPublishAllOptions
    ): Promise<PublishAllResult> {
        emitEffectiveConfigPerPackage(progressBroadcaster, validated.packtoryConfig);
        return runBuildAndPublishValidated(validated, options, resolveAndLinkAllValidated);
    }

    async function buildAndPublishAllPublic(
        config: unknown,
        options: BuildAndPublishAllOptions
    ): Promise<PublishAllOutcome> {
        const reporting = maybeAttachAggregator(progressBroadcaster, options.collectReport);
        try {
            const validation = validateConfig(config);
            if (validation.isErr) {
                return createPublishAllOutcome(Result.err(configError(validation.error)), reporting.getReport);
            }

            const result = await runBuildAndPublish(validation.value, options);
            return createPublishAllOutcome(result, reporting.getReport);
        } finally {
            reporting.dispose();
        }
    }

    async function diffAgainstLatestPublishedPublic(config: unknown): Promise<ReleaseDiffAllOutcome> {
        const reporting = attachAggregator(progressBroadcaster);
        try {
            const validation = validateConfig(config);
            if (validation.isErr) {
                return createReleaseDiffAllOutcome(Result.err(configError(validation.error)), reporting.getReport);
            }

            emitEffectiveConfigPerPackage(progressBroadcaster, validation.value.packtoryConfig);
            const result = await diffAgainstLatestPublishedValidated(validation.value, resolveAndLinkAllValidated);
            return createReleaseDiffAllOutcome(result, reporting.getReport);
        } finally {
            reporting.dispose();
        }
    }

    return {
        buildAndPublishAll: buildAndPublishAllPublic,
        diffAgainstLatestPublished: diffAgainstLatestPublishedPublic,
        resolveAndLinkAll: resolveAndLinkAllPublic
    };
}
