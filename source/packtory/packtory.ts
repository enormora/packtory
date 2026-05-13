import { Result } from 'true-myth';
import { validateConfig, validateConfigWithoutRegistry, type ValidConfigResult } from '../config/validation.ts';
import type { DeadCodeEliminator } from '../dead-code-eliminator/analyzed-bundle.ts';
import { emitEffectiveConfigPerPackage, maybeAttachAggregator } from './report-attachment.ts';
import { createResolveAndLinkAllValidated } from './packtory-resolve.ts';
import { createRunBuildAndPublishValidated } from './packtory-publish.ts';
import {
    configError,
    createPublishAllOutcome,
    createResolveAndLinkAllOutcome,
    type BuildAndPublishAllOptions as BuildAndPublishAllOptionsBase,
    type BuildReport as BuildReportBase,
    type Packtory as PacktoryBase,
    type ProgressBroadcaster,
    type PublishAllOutcome as PublishAllOutcomeBase,
    type PublishAllResult as PublishAllResultBase,
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
export type PublishAllResult = PublishAllResultBase;
export type ResolveAndLinkAllResult = ResolveAndLinkAllResultBase;
export type ResolveAndLinkFailure = ResolveAndLinkFailureBase;
export type Packtory = PacktoryBase;

type PacktoryDependencies = {
    readonly packageProcessor: PackageProcessor;
    readonly scheduler: PacktoryScheduler;
    readonly deadCodeEliminator: DeadCodeEliminator;
    readonly progressBroadcaster: ProgressBroadcaster;
};

export function createPacktory(dependencies: PacktoryDependencies): Packtory {
    const { progressBroadcaster } = dependencies;
    const resolveAndLinkAllValidated = createResolveAndLinkAllValidated(dependencies);
    const runBuildAndPublishValidated = createRunBuildAndPublishValidated(dependencies);

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

    return {
        buildAndPublishAll: buildAndPublishAllPublic,
        resolveAndLinkAll: resolveAndLinkAllPublic
    };
}
