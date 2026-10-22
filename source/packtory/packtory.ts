/* eslint-disable import/max-dependencies -- the packtory facade legitimately stitches together validation, resolve+link, publish, release-diff, release-analysis, pack, and report attachment */
import { Result } from 'true-myth';
import type { SymbolEliminationInspector, DeadCodeEliminator } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { ArtifactsBuilder } from '../artifacts/artifacts-builder.ts';
import type { CheckRunner } from '../checks/check-runner.ts';
import {
    validateConfiguration,
    validateConfigurationWithoutRegistry,
    type ValidConfigurationResult
} from '../configuration/validation.ts';
import type { FileManager } from '../file-manager/file-manager.ts';
import type { PackEmitter } from '../pack-emitter/pack-emitter.ts';
import type { VendorMaterializer } from '../vendor-materializer/vendor-materializer.ts';
import type { VersionManager } from '../version-manager/manager.ts';
import type { CurrentGitHeadReader } from '../git/current-git-head.ts';
import { createInspectPackageSymbolsValidated } from './packtory-package-symbols.ts';
import { createAnalyzeReleaseAgainstLatestPublishedValidated } from './packtory-release-analysis.ts';
import { createDiffAgainstLatestPublishedValidated } from './packtory-release-diff.ts';
import { createInspectPackageDependenciesValidated } from './packtory-package-dependencies.ts';
import { createInspectPackageFilesValidated } from './packtory-package-files.ts';
import { createInspectPackageSideEffectsValidated } from './packtory-package-side-effects.ts';
import { createInspectPackageTreeValidated } from './packtory-package-tree.ts';
import { createPlanReleaseAgainstLatestPublishedValidated } from './packtory-release-plan.ts';
import { createRunPackAllValidated, createRunPackValidated } from './packtory-pack.ts';
import { attachAggregator, emitEffectiveConfigurationPerPackage, maybeAttachAggregator } from './report-attachment.ts';
import { createResolveAndLinkAllValidated } from './packtory-resolve.ts';
import { createRunBuildAndPublishValidated } from './packtory-publish.ts';
import {
    createReleaseAnalysisOutcome,
    createPackAllOutcome,
    configurationError,
    createPackOutcome,
    createPackageDependencyInspectionOutcome,
    createPackageFileInspectionOutcome,
    createPackageSideEffectsInspectionOutcome,
    createPackageTreeOutcome,
    createReleasePlanOutcome,
    createPublishAllOutcome,
    createReleaseDiffAllOutcome,
    createResolveAndLinkAllOutcome,
    type BuildAndPublishAllOptions as BuildAndPublishAllOptionsBase,
    type BuildReport as BuildReportBase,
    type PackageReleaseAnalysis as PackageReleaseAnalysisBase,
    type PackageReleaseAnalysisClassification as PackageReleaseAnalysisClassificationBase,
    type PackageDependencyInspection as PackageDependencyInspectionBase,
    type PackageDependencyInspectionOutcome as PackageDependencyInspectionOutcomeBase,
    type PackageDependencyInspectionResult as PackageDependencyInspectionResultBase,
    type PackageFileInspection as PackageFileInspectionBase,
    type PackageSymbolInspection as PackageSymbolInspectionBase,
    type PackageSymbolInspectionOutcome as PackageSymbolInspectionOutcomeBase,
    type PackageSymbolInspectionResult as PackageSymbolInspectionResultBase,
    type PackageFileInspectionOutcome as PackageFileInspectionOutcomeBase,
    type PackageFileInspectionResult as PackageFileInspectionResultBase,
    type PackageSideEffectsInspection as PackageSideEffectsInspectionBase,
    type PackageSideEffectsInspectionOutcome as PackageSideEffectsInspectionOutcomeBase,
    type PackageSideEffectsInspectionResult as PackageSideEffectsInspectionResultBase,
    type PackageTree,
    type PackageTreeOutcome,
    type PackAllOutcome as PackAllOutcomeBase,
    type PackAllPublicOptions as PackAllPublicOptionsBase,
    type PackAllResult as PackAllResultBase,
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
import type { VersionSourceResolver } from './map-configuration.ts';

export type BuildAndPublishAllOptions = BuildAndPublishAllOptionsBase;
export type ResolveAndLinkAllOptions = ResolveAndLinkAllOptionsBase;
export type BuildReport = BuildReportBase;
export type PublishAllOutcome = PublishAllOutcomeBase;
export type ResolveAndLinkAllOutcome = ResolveAndLinkAllOutcomeBase;
export type ReleaseDiffAllOutcome = ReleaseDiffAllOutcomeBase;
export type ReleaseAnalysisOutcome = ReleaseAnalysisOutcomeBase;
export type ReleasePlanOutcome = ReleasePlanOutcomeBase;
export type PackAllOutcome = PackAllOutcomeBase;
export type PackAllResult = PackAllResultBase;
export type PackAllPublicOptions = PackAllPublicOptionsBase;
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
export type PackageDependencyInspection = PackageDependencyInspectionBase;
export type PackageDependencyInspectionOutcome = PackageDependencyInspectionOutcomeBase;
export type PackageDependencyInspectionResult = PackageDependencyInspectionResultBase;
export type PackageFileInspection = PackageFileInspectionBase;
export type PackageSymbolInspection = PackageSymbolInspectionBase;
export type PackageSymbolInspectionOutcome = PackageSymbolInspectionOutcomeBase;
export type PackageSymbolInspectionResult = PackageSymbolInspectionResultBase;
export type PackageFileInspectionOutcome = PackageFileInspectionOutcomeBase;
export type PackageFileInspectionResult = PackageFileInspectionResultBase;
export type PackageSideEffectsInspection = PackageSideEffectsInspectionBase;
export type PackageSideEffectsInspectionOutcome = PackageSideEffectsInspectionOutcomeBase;
export type PackageSideEffectsInspectionResult = PackageSideEffectsInspectionResultBase;
export type ResolveAndLinkFailure = ResolveAndLinkFailureBase;
export type Packtory = PacktoryBase;

export type PacktoryDependencies = {
    readonly packageProcessor: PackageProcessor;
    readonly scheduler: PacktoryScheduler;
    readonly deadCodeEliminator: DeadCodeEliminator;
    readonly inspectSymbols: SymbolEliminationInspector;
    readonly progressBroadcaster: ProgressBroadcaster;
    readonly artifactsBuilder: Pick<ArtifactsBuilder, 'collectContents'>;
    readonly fileManager: Pick<FileManager, 'checkDirectory' | 'checkReadability' | 'readFile'>;
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
    readonly runPackAllValidated: ReturnType<typeof createRunPackAllValidated>;
    readonly inspectPackageDependenciesValidated: ReturnType<typeof createInspectPackageDependenciesValidated>;
    readonly inspectPackageFilesValidated: ReturnType<typeof createInspectPackageFilesValidated>;
    readonly inspectPackageSymbolsValidated: ReturnType<typeof createInspectPackageSymbolsValidated>;
    readonly inspectPackageSideEffectsValidated: ReturnType<typeof createInspectPackageSideEffectsValidated>;
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
        runPackAllValidated: createRunPackAllValidated(dependencies),
        inspectPackageDependenciesValidated: createInspectPackageDependenciesValidated(dependencies),
        inspectPackageFilesValidated: createInspectPackageFilesValidated(dependencies),
        inspectPackageSymbolsValidated: createInspectPackageSymbolsValidated(dependencies),
        inspectPackageSideEffectsValidated: createInspectPackageSideEffectsValidated(dependencies),
        inspectPackageTreeValidated: createInspectPackageTreeValidated(dependencies)
    };
}

type Reporting<TReport> = {
    readonly dispose: () => void;
    readonly getReport: () => TReport;
};

type InspectPackageTreeInput = {
    readonly configuration: unknown;
    readonly inspectPackageTreeValidated: ReturnType<typeof createInspectPackageTreeValidated>;
    readonly packageName: string;
    readonly reporting: Reporting<BuildReport>;
    readonly resolveAndLinkAllValidated: ReturnType<typeof createResolveAndLinkAllValidated>;
};

type PackAllPackagesInput = {
    readonly configuration: unknown;
    readonly options: PackAllPublicOptions;
    readonly runPackAllValidated: ReturnType<typeof createRunPackAllValidated>;
    readonly resolveAndLinkAllValidated: ReturnType<typeof createResolveAndLinkAllValidated>;
};

type InspectPackageDependenciesInput = {
    readonly configuration: unknown;
    readonly inspectPackageDependenciesValidated: ReturnType<typeof createInspectPackageDependenciesValidated>;
    readonly packageName: string;
};

type InspectPackageSideEffectsInput = {
    readonly configuration: unknown;
    readonly inspectPackageSideEffectsValidated: ReturnType<typeof createInspectPackageSideEffectsValidated>;
    readonly packageName: string;
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

const missingPublishAuthenticationIssue =
    'registrySettings.authentication must be configured to publish; run with dryRun=true to skip the registry write.';

function ensureAuthenticationConfiguredForRealPublish(
    validated: ValidConfigurationResult,
    options: BuildAndPublishAllOptions
): Result<ValidConfigurationResult, PublishAllResult> {
    if (options.dryRun || validated.packtoryConfiguration.registrySettings?.authentication !== undefined) {
        return Result.ok(validated);
    }
    return Result.err(Result.err(configurationError([ missingPublishAuthenticationIssue ])));
}

type ReportedOperationArguments<TValidated, TResult, TReport, TOutcome> = {
    readonly configuration: unknown;
    readonly attachReporting: () => Reporting<TReport>;
    readonly validate: (configuration: unknown) => Result<TValidated, readonly string[]>;
    readonly runValidated: (validated: TValidated) => Promise<TResult>;
    readonly createValidationErrorResult: (issues: readonly string[]) => TResult;
    readonly createOutcome: (result: TResult, getReport: () => TReport) => TOutcome;
};

async function createReportedOutcome<TValidated, TResult, TReport, TOutcome>(
    operation: ReportedOperationArguments<TValidated, TResult, TReport, TOutcome>,
    getReport: () => TReport
): Promise<TOutcome> {
    const validation = operation.validate(operation.configuration);
    const result = validation.isErr
        ? operation.createValidationErrorResult(validation.error)
        : await operation.runValidated(validation.value);

    return operation.createOutcome(result, getReport);
}

async function runReportedOperation<TValidated, TResult, TReport, TOutcome>(
    operation: ReportedOperationArguments<TValidated, TResult, TReport, TOutcome>
): Promise<TOutcome> {
    const reporting = operation.attachReporting();
    try {
        return await createReportedOutcome(operation, reporting.getReport);
    } finally {
        reporting.dispose();
    }
}

async function inspectPackageTreeWithReport(input: InspectPackageTreeInput): Promise<PackageTreeOutcome> {
    const validation = validateConfigurationWithoutRegistry(input.configuration);
    if (validation.isErr) {
        return createPackageTreeOutcome(Result.err(configurationError(validation.error)));
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

async function packAllPackagesWithValidation(input: PackAllPackagesInput): Promise<PackAllOutcome> {
    const validation = validateConfigurationWithoutRegistry(input.configuration);
    if (validation.isErr) {
        return createPackAllOutcome(Result.err(configurationError(validation.error)));
    }

    const result = await input.runPackAllValidated(
        validation.value,
        input.options,
        input.resolveAndLinkAllValidated
    );
    return createPackAllOutcome(result);
}

async function inspectPackageDependenciesWithValidation(
    input: InspectPackageDependenciesInput
): Promise<PackageDependencyInspectionOutcome> {
    const validation = validateConfigurationWithoutRegistry(input.configuration);
    if (validation.isErr) {
        return createPackageDependencyInspectionOutcome(Result.err(configurationError(validation.error)));
    }
    const result = await input.inspectPackageDependenciesValidated(validation.value, input.packageName);
    return createPackageDependencyInspectionOutcome(result);
}

async function inspectPackageSideEffectsWithValidation(
    input: InspectPackageSideEffectsInput
): Promise<PackageSideEffectsInspectionOutcome> {
    const validation = validateConfigurationWithoutRegistry(input.configuration);
    if (validation.isErr) {
        return createPackageSideEffectsInspectionOutcome(Result.err(configurationError(validation.error)));
    }
    const result = await input.inspectPackageSideEffectsValidated(validation.value, input.packageName);
    return createPackageSideEffectsInspectionOutcome(result);
}

export function createPacktory(dependencies: PacktoryDependencies): Packtory {
    const {
        resolveAndLinkAllValidated,
        runBuildAndPublishValidated,
        diffAgainstLatestPublishedValidated,
        analyzeReleaseAgainstLatestPublishedValidated,
        planReleaseAgainstLatestPublishedValidated,
        runPackValidated,
        runPackAllValidated,
        inspectPackageDependenciesValidated,
        inspectPackageFilesValidated,
        inspectPackageSymbolsValidated,
        inspectPackageSideEffectsValidated,
        inspectPackageTreeValidated
    } = createValidatedRunners(dependencies);

    async function resolveAndLinkAllPublic(
        configuration: unknown,
        options?: ResolveAndLinkAllOptions
    ): Promise<ResolveAndLinkAllOutcome> {
        return runReportedOperation({
            configuration,
            attachReporting() {
                return maybeAttachAggregator(dependencies.progressBroadcaster, options?.collectReport);
            },
            validate: validateConfigurationWithoutRegistry,
            runValidated: resolveAndLinkAllValidated,
            createValidationErrorResult(issues) {
                return Result.err(configurationError(issues));
            },
            createOutcome: createResolveAndLinkAllOutcome
        });
    }

    async function runBuildAndPublish(
        validated: ValidConfigurationResult,
        options: BuildAndPublishAllOptions
    ): Promise<PublishAllResult> {
        emitEffectiveConfigurationPerPackage(dependencies.progressBroadcaster, validated.packtoryConfiguration);
        return runBuildAndPublishValidated(validated, options, resolveAndLinkAllValidated);
    }

    async function buildAndPublishAllPublic(
        configuration: unknown,
        options: BuildAndPublishAllOptions
    ): Promise<PublishAllOutcome> {
        return runReportedOperation({
            configuration,
            attachReporting() {
                return maybeAttachAggregator(dependencies.progressBroadcaster, options.collectReport);
            },
            validate: validateConfiguration,
            async runValidated(validated) {
                const guarded = ensureAuthenticationConfiguredForRealPublish(validated, options);
                if (guarded.isErr) {
                    return guarded.error;
                }
                return runBuildAndPublish(guarded.value, options);
            },
            createValidationErrorResult(issues) {
                return Result.err(configurationError(issues));
            },
            createOutcome: createPublishAllOutcome
        });
    }

    async function packPackagePublic(configuration: unknown, options: PackPublicOptions): Promise<PackOutcome> {
        const validation = validateConfigurationWithoutRegistry(configuration);
        if (validation.isErr) {
            return createPackOutcome(Result.err(configurationError(validation.error)));
        }

        const result = await runPackValidated(validation.value, options, resolveAndLinkAllValidated);
        return createPackOutcome(result);
    }

    async function inspectPackageTreePublic(configuration: unknown, packageName: string): Promise<PackageTreeOutcome> {
        const reporting = attachAggregator(dependencies.progressBroadcaster);
        try {
            return await inspectPackageTreeWithReport({
                configuration,
                inspectPackageTreeValidated,
                packageName,
                reporting,
                resolveAndLinkAllValidated
            });
        } finally {
            reporting.dispose();
        }
    }

    async function diffAgainstLatestPublishedPublic(configuration: unknown): Promise<ReleaseDiffAllOutcome> {
        return runReportedOperation({
            configuration,
            attachReporting() {
                return attachAggregator(dependencies.progressBroadcaster);
            },
            validate: validateConfiguration,
            async runValidated(validated) {
                emitEffectiveConfigurationPerPackage(dependencies.progressBroadcaster, validated.packtoryConfiguration);
                return diffAgainstLatestPublishedValidated(validated, resolveAndLinkAllValidated);
            },
            createValidationErrorResult(issues) {
                return Result.err(configurationError(issues));
            },
            createOutcome: createReleaseDiffAllOutcome
        });
    }

    async function analyzeReleaseAgainstLatestPublishedPublic(configuration: unknown): Promise<ReleaseAnalysisOutcome> {
        return runReportedOperation({
            configuration,
            attachReporting() {
                return attachAggregator(dependencies.progressBroadcaster);
            },
            validate: validateConfiguration,
            async runValidated(validated) {
                emitEffectiveConfigurationPerPackage(dependencies.progressBroadcaster, validated.packtoryConfiguration);
                return analyzeReleaseAgainstLatestPublishedValidated(validated, resolveAndLinkAllValidated);
            },
            createValidationErrorResult(issues) {
                return Result.err(configurationError(issues));
            },
            createOutcome: createReleaseAnalysisOutcome
        });
    }

    async function planReleaseAgainstLatestPublishedPublic(configuration: unknown): Promise<ReleasePlanOutcome> {
        return runReportedOperation({
            configuration,
            attachReporting() {
                return attachAggregator(dependencies.progressBroadcaster);
            },
            validate: validateConfiguration,
            async runValidated(validated) {
                emitEffectiveConfigurationPerPackage(dependencies.progressBroadcaster, validated.packtoryConfiguration);
                return planReleaseAgainstLatestPublishedValidated(validated, resolveAndLinkAllValidated);
            },
            createValidationErrorResult(issues) {
                return Result.err(configurationError(issues));
            },
            createOutcome: createReleasePlanOutcome
        });
    }

    return {
        analyzeReleaseAgainstLatestPublished: analyzeReleaseAgainstLatestPublishedPublic,
        buildAndPublishAll: buildAndPublishAllPublic,
        diffAgainstLatestPublished: diffAgainstLatestPublishedPublic,
        async inspectPackageDependencies(configuration, packageName) {
            return inspectPackageDependenciesWithValidation({
                configuration,
                inspectPackageDependenciesValidated,
                packageName
            });
        },
        async inspectPackageFiles(configuration, packageName) {
            const validation = validateConfigurationWithoutRegistry(configuration);
            const result = validation.isErr
                ? Result.err(configurationError(validation.error))
                : await inspectPackageFilesValidated(validation.value, packageName);
            return createPackageFileInspectionOutcome(result);
        },
        async inspectPackageSymbols(configuration, packageName) {
            const validation = validateConfigurationWithoutRegistry(configuration);
            const result = validation.isErr
                ? Result.err(configurationError(validation.error))
                : await inspectPackageSymbolsValidated(validation.value, packageName);
            return { result };
        },
        async inspectPackageSideEffects(configuration, packageName) {
            return inspectPackageSideEffectsWithValidation({
                configuration,
                inspectPackageSideEffectsValidated,
                packageName
            });
        },
        planReleaseAgainstLatestPublished: planReleaseAgainstLatestPublishedPublic,
        resolveAndLinkAll: resolveAndLinkAllPublic,
        packPackage: packPackagePublic,
        async packAllPackages(configuration, options) {
            return packAllPackagesWithValidation({
                configuration,
                options,
                runPackAllValidated,
                resolveAndLinkAllValidated
            });
        },
        inspectPackageTree: inspectPackageTreePublic
    };
}
