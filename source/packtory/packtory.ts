/* eslint-disable import/max-dependencies -- the packtory facade legitimately stitches together validation, resolve+link, publish, release-diff, release-analysis, pack, and report attachment */
import { Result } from 'true-myth';
import type { ArtifactsBuilder } from '../artifacts/artifacts-builder.ts';
import type { CheckRunner } from '../checks/check-runner.ts';
import { validateConfig, validateConfigWithoutRegistry, type ValidConfigResult } from '../config/validation.ts';
import type { DeadCodeEliminator } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { FileManager } from '../file-manager/file-manager.ts';
import type { PackEmitter } from '../pack-emitter/pack-emitter.ts';
import type { VendorMaterializer } from '../vendor-materializer/vendor-materializer.ts';
import type { VersionManager } from '../version-manager/manager.ts';
import type { CurrentGitHeadReader } from '../git/current-git-head.ts';
import { createAnalyzeReleaseAgainstLatestPublishedValidated } from './packtory-release-analysis.ts';
import { createDiffAgainstLatestPublishedValidated } from './packtory-release-diff.ts';
import { createInspectPackageTreeValidated } from './packtory-package-tree.ts';
import { createPlanReleaseAgainstLatestPublishedValidated } from './packtory-release-plan.ts';
import { createRunPackValidated } from './packtory-pack.ts';
import { attachAggregator, emitEffectiveConfigPerPackage, maybeAttachAggregator } from './report-attachment.ts';
import { createResolveAndLinkAllValidated } from './packtory-resolve.ts';
import { createRunBuildAndPublishValidated } from './packtory-publish.ts';
import {
    createReleaseAnalysisOutcome,
    configError,
    createPackOutcome,
    createPackageTreeOutcome,
    createReleasePlanOutcome,
    createPublishAllOutcome,
    createReleaseDiffAllOutcome,
    createResolveAndLinkAllOutcome,
    type BuildAndPublishAllOptions as BuildAndPublishAllOptionsBase,
    type BuildReport as BuildReportBase,
    type PackageReleaseAnalysis as PackageReleaseAnalysisBase,
    type PackageReleaseAnalysisClassification as PackageReleaseAnalysisClassificationBase,
    type PackageTree,
    type PackageTreeOutcome,
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
    type ReleasePlan as ReleasePlanBase,
    type ReleasePlanOutcome as ReleasePlanOutcomeBase,
    type ReleasePlanPackage as ReleasePlanPackageBase,
    type ReleasePlanRegistryMetadata as ReleasePlanRegistryMetadataBase,
    type ReleasePlanResult as ReleasePlanResultBase,
    type ResolveAndLinkFailure as ResolveAndLinkFailureBase,
    type ResolveAndLinkAllOptions as ResolveAndLinkAllOptionsBase,
    type ResolveAndLinkAllOutcome as ResolveAndLinkAllOutcomeBase,
    type ResolveAndLinkAllResult as ResolveAndLinkAllResultBase
} from './packtory-results.ts';
import type { PackageProcessor } from './package-processor.ts';
import type { Scheduler as PacktoryScheduler } from './scheduler.ts';
import type { VersionSourceResolver } from './map-config.ts';

export type BuildAndPublishAllOptions = BuildAndPublishAllOptionsBase;
export type ResolveAndLinkAllOptions = ResolveAndLinkAllOptionsBase;
export type BuildReport = BuildReportBase;
export type PublishAllOutcome = PublishAllOutcomeBase;
export type ResolveAndLinkAllOutcome = ResolveAndLinkAllOutcomeBase;
export type ReleaseDiffAllOutcome = ReleaseDiffAllOutcomeBase;
export type ReleaseAnalysisOutcome = ReleaseAnalysisOutcomeBase;
export type ReleasePlanOutcome = ReleasePlanOutcomeBase;
export type PackOutcome = PackOutcomeBase;
export type PackResult = PackResultBase;
export type PackPublicOptions = PackPublicOptionsBase;
export type PublishAllResult = PublishAllResultBase;
export type ResolveAndLinkAllResult = ResolveAndLinkAllResultBase;
export type ReleaseDiffAllResult = ReleaseDiffAllResultBase;
export type ReleaseAnalysisResult = ReleaseAnalysisResultBase;
export type ReleasePlanResult = ReleasePlanResultBase;
export type ReleaseAnalysis = ReleaseAnalysisBase;
export type ReleasePlan = ReleasePlanBase;
export type ReleasePlanPackage = ReleasePlanPackageBase;
export type ReleasePlanRegistryMetadata = ReleasePlanRegistryMetadataBase;
export type PackageReleaseAnalysis = PackageReleaseAnalysisBase;
export type PackageReleaseAnalysisClassification = PackageReleaseAnalysisClassificationBase;
export type ResolveAndLinkFailure = ResolveAndLinkFailureBase;
export type Packtory = PacktoryBase;

export type PacktoryDependencies = {
    readonly packageProcessor: PackageProcessor;
    readonly scheduler: PacktoryScheduler;
    readonly deadCodeEliminator: DeadCodeEliminator;
    readonly progressBroadcaster: ProgressBroadcaster;
    readonly artifactsBuilder: Pick<ArtifactsBuilder, 'collectContents'>;
    readonly fileManager: Pick<FileManager, 'checkReadability' | 'readFile'>;
    readonly repositoryFolder: string;
    readonly versionManager: VersionManager;
    readonly runChecks: CheckRunner;
    readonly packEmitter: PackEmitter;
    readonly vendorMaterializer: VendorMaterializer;
    readonly readCurrentGitHead: CurrentGitHeadReader;
    readonly resolveVersionSource?: VersionSourceResolver | undefined;
};

type ValidatedRunners = {
    readonly resolveAndLinkAllValidated: ReturnType<typeof createResolveAndLinkAllValidated>;
    readonly runBuildAndPublishValidated: ReturnType<typeof createRunBuildAndPublishValidated>;
    readonly diffAgainstLatestPublishedValidated: ReturnType<typeof createDiffAgainstLatestPublishedValidated>;
    readonly analyzeReleaseAgainstLatestPublishedValidated: ReturnType<
        typeof createAnalyzeReleaseAgainstLatestPublishedValidated
    >;
    readonly planReleaseAgainstLatestPublishedValidated: ReturnType<
        typeof createPlanReleaseAgainstLatestPublishedValidated
    >;
    readonly runPackValidated: ReturnType<typeof createRunPackValidated>;
    readonly inspectPackageTreeValidated: ReturnType<typeof createInspectPackageTreeValidated>;
};

function createValidatedRunners(dependencies: PacktoryDependencies): ValidatedRunners {
    return {
        resolveAndLinkAllValidated: createResolveAndLinkAllValidated(dependencies),
        runBuildAndPublishValidated: createRunBuildAndPublishValidated(dependencies),
        diffAgainstLatestPublishedValidated: createDiffAgainstLatestPublishedValidated(dependencies),
        analyzeReleaseAgainstLatestPublishedValidated: createAnalyzeReleaseAgainstLatestPublishedValidated(
            dependencies
        ),
        planReleaseAgainstLatestPublishedValidated: createPlanReleaseAgainstLatestPublishedValidated(dependencies),
        runPackValidated: createRunPackValidated(dependencies),
        inspectPackageTreeValidated: createInspectPackageTreeValidated(dependencies)
    };
}

type Reporting<TReport> = {
    readonly dispose: () => void;
    readonly getReport: () => TReport;
};

type InspectPackageTreeInput = {
    readonly config: unknown;
    readonly inspectPackageTreeValidated: ReturnType<typeof createInspectPackageTreeValidated>;
    readonly packageName: string;
    readonly reporting: Reporting<BuildReport>;
    readonly resolveAndLinkAllValidated: ReturnType<typeof createResolveAndLinkAllValidated>;
};

function selectPackageTreeEntries(report: BuildReport, packageName: string): PackageTree['entries'] {
    const packageReport = report.packages[packageName];
    if (packageReport === undefined) {
        throw new Error(`Package tree report for "${packageName}" is missing`);
    }
    if (packageReport.outputs === undefined) {
        throw new Error(`Package tree outputs for "${packageName}" are missing`);
    }
    return packageReport.outputs.tarball.entries;
}

const missingPublishAuthIssue =
    'registrySettings.auth must be configured to publish; run with dryRun=true to skip the registry write.';

function ensureAuthConfiguredForRealPublish(
    validated: ValidConfigResult,
    options: BuildAndPublishAllOptions
): Result<ValidConfigResult, PublishAllResult> {
    if (options.dryRun || validated.packtoryConfig.registrySettings?.auth !== undefined) {
        return Result.ok(validated);
    }
    return Result.err(Result.err(configError([ missingPublishAuthIssue ])));
}

type ReportedOperationArgs<TValidated, TResult, TReport, TOutcome> = {
    readonly config: unknown;
    readonly attachReporting: () => Reporting<TReport>;
    readonly validate: (config: unknown) => Result<TValidated, readonly string[]>;
    readonly runValidated: (validated: TValidated) => Promise<TResult>;
    readonly createValidationErrorResult: (issues: readonly string[]) => TResult;
    readonly createOutcome: (result: TResult, getReport: () => TReport) => TOutcome;
};

async function createReportedOutcome<TValidated, TResult, TReport, TOutcome>(
    operation: ReportedOperationArgs<TValidated, TResult, TReport, TOutcome>,
    getReport: () => TReport
): Promise<TOutcome> {
    const validation = operation.validate(operation.config);
    const result = validation.isErr
        ? operation.createValidationErrorResult(validation.error)
        : await operation.runValidated(validation.value);

    return operation.createOutcome(result, getReport);
}

async function runReportedOperation<TValidated, TResult, TReport, TOutcome>(
    operation: ReportedOperationArgs<TValidated, TResult, TReport, TOutcome>
): Promise<TOutcome> {
    const reporting = operation.attachReporting();
    try {
        return await createReportedOutcome(operation, reporting.getReport);
    } finally {
        reporting.dispose();
    }
}

async function inspectPackageTreeWithReport(input: InspectPackageTreeInput): Promise<PackageTreeOutcome> {
    const validation = validateConfigWithoutRegistry(input.config);
    if (validation.isErr) {
        return createPackageTreeOutcome(Result.err(configError(validation.error)));
    }

    const result = await input.inspectPackageTreeValidated(
        validation.value,
        input.packageName,
        input.resolveAndLinkAllValidated,
        function selectTreeEntries(selectedPackageName) {
            const report = input.reporting.getReport();
            const entries = selectPackageTreeEntries(report, selectedPackageName);
            return Result.ok({ packageName: selectedPackageName, entries });
        }
    );
    return createPackageTreeOutcome(result);
}

export function createPacktory(dependencies: PacktoryDependencies): Packtory {
    const {
        resolveAndLinkAllValidated,
        runBuildAndPublishValidated,
        diffAgainstLatestPublishedValidated,
        analyzeReleaseAgainstLatestPublishedValidated,
        planReleaseAgainstLatestPublishedValidated,
        runPackValidated,
        inspectPackageTreeValidated
    } = createValidatedRunners(dependencies);

    async function resolveAndLinkAllPublic(
        config: unknown,
        options?: ResolveAndLinkAllOptions
    ): Promise<ResolveAndLinkAllOutcome> {
        return runReportedOperation({
            config,
            attachReporting() {
                return maybeAttachAggregator(dependencies.progressBroadcaster, options?.collectReport);
            },
            validate: validateConfigWithoutRegistry,
            runValidated: resolveAndLinkAllValidated,
            createValidationErrorResult(issues) {
                return Result.err(configError(issues));
            },
            createOutcome: createResolveAndLinkAllOutcome
        });
    }

    async function runBuildAndPublish(
        validated: ValidConfigResult,
        options: BuildAndPublishAllOptions
    ): Promise<PublishAllResult> {
        emitEffectiveConfigPerPackage(dependencies.progressBroadcaster, validated.packtoryConfig);
        return runBuildAndPublishValidated(validated, options, resolveAndLinkAllValidated);
    }

    async function buildAndPublishAllPublic(
        config: unknown,
        options: BuildAndPublishAllOptions
    ): Promise<PublishAllOutcome> {
        return runReportedOperation({
            config,
            attachReporting() {
                return maybeAttachAggregator(dependencies.progressBroadcaster, options.collectReport);
            },
            validate: validateConfig,
            async runValidated(validated) {
                const guarded = ensureAuthConfiguredForRealPublish(validated, options);
                if (guarded.isErr) {
                    return guarded.error;
                }
                return runBuildAndPublish(guarded.value, options);
            },
            createValidationErrorResult(issues) {
                return Result.err(configError(issues));
            },
            createOutcome: createPublishAllOutcome
        });
    }

    async function packPackagePublic(config: unknown, options: PackPublicOptions): Promise<PackOutcome> {
        const validation = validateConfigWithoutRegistry(config);
        if (validation.isErr) {
            return createPackOutcome(Result.err(configError(validation.error)));
        }

        const result = await runPackValidated(validation.value, options, resolveAndLinkAllValidated);
        return createPackOutcome(result);
    }

    async function inspectPackageTreePublic(config: unknown, packageName: string): Promise<PackageTreeOutcome> {
        const reporting = attachAggregator(dependencies.progressBroadcaster);
        try {
            return await inspectPackageTreeWithReport({
                config,
                inspectPackageTreeValidated,
                packageName,
                reporting,
                resolveAndLinkAllValidated
            });
        } finally {
            reporting.dispose();
        }
    }

    async function diffAgainstLatestPublishedPublic(config: unknown): Promise<ReleaseDiffAllOutcome> {
        return runReportedOperation({
            config,
            attachReporting() {
                return attachAggregator(dependencies.progressBroadcaster);
            },
            validate: validateConfig,
            async runValidated(validated) {
                emitEffectiveConfigPerPackage(dependencies.progressBroadcaster, validated.packtoryConfig);
                return diffAgainstLatestPublishedValidated(validated, resolveAndLinkAllValidated);
            },
            createValidationErrorResult(issues) {
                return Result.err(configError(issues));
            },
            createOutcome: createReleaseDiffAllOutcome
        });
    }

    async function analyzeReleaseAgainstLatestPublishedPublic(config: unknown): Promise<ReleaseAnalysisOutcome> {
        return runReportedOperation({
            config,
            attachReporting() {
                return attachAggregator(dependencies.progressBroadcaster);
            },
            validate: validateConfig,
            async runValidated(validated) {
                emitEffectiveConfigPerPackage(dependencies.progressBroadcaster, validated.packtoryConfig);
                return analyzeReleaseAgainstLatestPublishedValidated(validated, resolveAndLinkAllValidated);
            },
            createValidationErrorResult(issues) {
                return Result.err(configError(issues));
            },
            createOutcome: createReleaseAnalysisOutcome
        });
    }

    async function planReleaseAgainstLatestPublishedPublic(config: unknown): Promise<ReleasePlanOutcome> {
        return runReportedOperation({
            config,
            attachReporting() {
                return attachAggregator(dependencies.progressBroadcaster);
            },
            validate: validateConfig,
            async runValidated(validated) {
                emitEffectiveConfigPerPackage(dependencies.progressBroadcaster, validated.packtoryConfig);
                return planReleaseAgainstLatestPublishedValidated(validated, resolveAndLinkAllValidated);
            },
            createValidationErrorResult(issues) {
                return Result.err(configError(issues));
            },
            createOutcome: createReleasePlanOutcome
        });
    }

    return {
        analyzeReleaseAgainstLatestPublished: analyzeReleaseAgainstLatestPublishedPublic,
        buildAndPublishAll: buildAndPublishAllPublic,
        diffAgainstLatestPublished: diffAgainstLatestPublishedPublic,
        planReleaseAgainstLatestPublished: planReleaseAgainstLatestPublishedPublic,
        resolveAndLinkAll: resolveAndLinkAllPublic,
        packPackage: packPackagePublic,
        inspectPackageTree: inspectPackageTreePublic
    };
}
