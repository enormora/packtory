/* eslint-disable import/max-dependencies -- the packtory facade legitimately stitches together validation, resolve+link, publish, release-diff, release-analysis, pack, and report attachment */
import { Result } from 'true-myth';
import type { ArtifactsBuilder } from '../artifacts/artifacts-builder.ts';
import { validateConfig, validateConfigWithoutRegistry, type ValidConfigResult } from '../config/validation.ts';
import type { DeadCodeEliminator } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { PackEmitter } from '../pack-emitter/pack-emitter.ts';
import type { VendorMaterializer } from '../vendor-materializer/vendor-materializer.ts';
import type { VersionManager } from '../version-manager/manager.ts';
import { createAnalyzeReleaseAgainstLatestPublishedValidated } from './packtory-release-analysis.ts';
import { createDiffAgainstLatestPublishedValidated } from './packtory-release-diff.ts';
import { createRunPackValidated } from './packtory-pack.ts';
import { attachAggregator, emitEffectiveConfigPerPackage, maybeAttachAggregator } from './report-attachment.ts';
import { createResolveAndLinkAllValidated } from './packtory-resolve.ts';
import { createRunBuildAndPublishValidated } from './packtory-publish.ts';
import {
    createReleaseAnalysisOutcome,
    configError,
    createPackOutcome,
    createPublishAllOutcome,
    createReleaseDiffAllOutcome,
    createResolveAndLinkAllOutcome,
    type BuildAndPublishAllOptions as BuildAndPublishAllOptionsBase,
    type BuildReport as BuildReportBase,
    type PackageReleaseAnalysis as PackageReleaseAnalysisBase,
    type PackageReleaseAnalysisClassification as PackageReleaseAnalysisClassificationBase,
    type PackOutcome as PackOutcomeBase,
    type PackPublicOptions as PackPublicOptionsBase,
    type PackResult as PackResultBase,
    type Packtory as PacktoryBase,
    type ProgressBroadcaster,
    type PublishAllOutcome as PublishAllOutcomeBase,
    type PublishAllResult as PublishAllResultBase,
    type ReleaseAnalysis as ReleaseAnalysisBase,
    type ReleaseAnalysisOutcome as ReleaseAnalysisOutcomeBase,
    type ReleaseAnalysisResult as ReleaseAnalysisResultBase,
    type ReleaseDiffAllOutcome as ReleaseDiffAllOutcomeBase,
    type ReleaseDiffAllResult as ReleaseDiffAllResultBase,
    type ResolveAndLinkFailure as ResolveAndLinkFailureBase,
    type ResolveAndLinkAllOptions as ResolveAndLinkAllOptionsBase,
    type ResolveAndLinkAllOutcome as ResolveAndLinkAllOutcomeBase,
    type ResolveAndLinkAllResult as ResolveAndLinkAllResultBase
} from './packtory-results.ts';
import type { PackageProcessor } from './package-processor.ts';
import type { Scheduler as PacktoryScheduler } from './scheduler.ts';

export type BuildAndPublishAllOptions = BuildAndPublishAllOptionsBase;
export type ResolveAndLinkAllOptions = ResolveAndLinkAllOptionsBase;
export type BuildReport = BuildReportBase;
export type PublishAllOutcome = PublishAllOutcomeBase;
export type ResolveAndLinkAllOutcome = ResolveAndLinkAllOutcomeBase;
export type ReleaseDiffAllOutcome = ReleaseDiffAllOutcomeBase;
export type ReleaseAnalysisOutcome = ReleaseAnalysisOutcomeBase;
export type PackOutcome = PackOutcomeBase;
export type PackResult = PackResultBase;
export type PackPublicOptions = PackPublicOptionsBase;
export type PublishAllResult = PublishAllResultBase;
export type ResolveAndLinkAllResult = ResolveAndLinkAllResultBase;
export type ReleaseDiffAllResult = ReleaseDiffAllResultBase;
export type ReleaseAnalysisResult = ReleaseAnalysisResultBase;
export type ReleaseAnalysis = ReleaseAnalysisBase;
export type PackageReleaseAnalysis = PackageReleaseAnalysisBase;
export type PackageReleaseAnalysisClassification = PackageReleaseAnalysisClassificationBase;
export type ResolveAndLinkFailure = ResolveAndLinkFailureBase;
export type Packtory = PacktoryBase;

type PacktoryDependencies = {
    readonly packageProcessor: PackageProcessor;
    readonly scheduler: PacktoryScheduler;
    readonly deadCodeEliminator: DeadCodeEliminator;
    readonly progressBroadcaster: ProgressBroadcaster;
    readonly artifactsBuilder: Pick<ArtifactsBuilder, 'collectContents'>;
    readonly versionManager: VersionManager;
    readonly packEmitter: PackEmitter;
    readonly vendorMaterializer: VendorMaterializer;
};

type ValidatedRunners = {
    readonly resolveAndLinkAllValidated: ReturnType<typeof createResolveAndLinkAllValidated>;
    readonly runBuildAndPublishValidated: ReturnType<typeof createRunBuildAndPublishValidated>;
    readonly diffAgainstLatestPublishedValidated: ReturnType<typeof createDiffAgainstLatestPublishedValidated>;
    readonly analyzeReleaseAgainstLatestPublishedValidated: ReturnType<
        typeof createAnalyzeReleaseAgainstLatestPublishedValidated
    >;
    readonly runPackValidated: ReturnType<typeof createRunPackValidated>;
};

function createValidatedRunners(dependencies: PacktoryDependencies): ValidatedRunners {
    return {
        resolveAndLinkAllValidated: createResolveAndLinkAllValidated(dependencies),
        runBuildAndPublishValidated: createRunBuildAndPublishValidated(dependencies),
        diffAgainstLatestPublishedValidated: createDiffAgainstLatestPublishedValidated(dependencies),
        analyzeReleaseAgainstLatestPublishedValidated:
            createAnalyzeReleaseAgainstLatestPublishedValidated(dependencies),
        runPackValidated: createRunPackValidated(dependencies)
    };
}

export function createPacktory(dependencies: PacktoryDependencies): Packtory {
    const { progressBroadcaster } = dependencies;
    const {
        resolveAndLinkAllValidated,
        runBuildAndPublishValidated,
        diffAgainstLatestPublishedValidated,
        analyzeReleaseAgainstLatestPublishedValidated,
        runPackValidated
    } = createValidatedRunners(dependencies);

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

    async function packPackagePublic(config: unknown, options: PackPublicOptions): Promise<PackOutcome> {
        const validation = validateConfigWithoutRegistry(config);
        if (validation.isErr) {
            return createPackOutcome(Result.err(configError(validation.error)));
        }

        const result = await runPackValidated(validation.value, options, resolveAndLinkAllValidated);
        return createPackOutcome(result);
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

    async function analyzeReleaseAgainstLatestPublishedPublic(config: unknown): Promise<ReleaseAnalysisOutcome> {
        const reporting = attachAggregator(progressBroadcaster);
        try {
            const validation = validateConfig(config);
            if (validation.isErr) {
                return createReleaseAnalysisOutcome(Result.err(configError(validation.error)), reporting.getReport);
            }

            emitEffectiveConfigPerPackage(progressBroadcaster, validation.value.packtoryConfig);
            const result = await analyzeReleaseAgainstLatestPublishedValidated(
                validation.value,
                resolveAndLinkAllValidated
            );
            return createReleaseAnalysisOutcome(result, reporting.getReport);
        } finally {
            reporting.dispose();
        }
    }

    return {
        analyzeReleaseAgainstLatestPublished: analyzeReleaseAgainstLatestPublishedPublic,
        buildAndPublishAll: buildAndPublishAllPublic,
        diffAgainstLatestPublished: diffAgainstLatestPublishedPublic,
        resolveAndLinkAll: resolveAndLinkAllPublic,
        packPackage: packPackagePublic
    };
}
