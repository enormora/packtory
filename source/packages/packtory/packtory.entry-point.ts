import type { PacktoryConfiguration as PublicPacktoryConfiguration } from '../../configuration/configuration.ts';
import type * as versioning from '../../configuration/manual-versioning-settings.ts';
import type {
    BuildAndPublishAllOptions as PublicBuildAndPublishAllOptions,
    BuildReport as PublicBuildReport,
    PackageDependencyInspection as PublicPackageDependencyInspection,
    PackageDependencyInspectionOutcome as PublicPackageDependencyInspectionOutcome,
    PackageDependencyInspectionResult as PublicPackageDependencyInspectionResult,
    PackageFileInspection as PublicPackageFileInspection,
    PackageSymbolInspection as PublicPackageSymbolInspection,
    PackageSymbolInspectionOutcome as PublicPackageSymbolInspectionOutcome,
    PackageSymbolInspectionResult as PublicPackageSymbolInspectionResult,
    PackageFileInspectionOutcome as PublicPackageFileInspectionOutcome,
    PackageFileInspectionResult as PublicPackageFileInspectionResult,
    PackageSideEffectsInspection as PublicPackageSideEffectsInspection,
    PackageSideEffectsInspectionOutcome as PublicPackageSideEffectsInspectionOutcome,
    PackageSideEffectsInspectionResult as PublicPackageSideEffectsInspectionResult,
    PackageReleaseAnalysis as PublicPackageReleaseAnalysis,
    PackageReleaseAnalysisClassification as PublicPackageReleaseAnalysisClassification,
    PackAllOutcome as PublicPackAllOutcome,
    PackAllPublicOptions as PublicPackAllPublicOptions,
    PackAllResult as PublicPackAllResult,
    PackOutcome as PublicPackOutcome,
    PackPublicOptions as PublicPackPublicOptions,
    PackResult as PublicPackResult,
    PublishAllOutcome as PublicPublishAllOutcome,
    PublishAllResult as PublicPublishAllResult,
    ReleaseAnalysis as PublicReleaseAnalysis,
    ReleaseAnalysisOutcome as PublicReleaseAnalysisOutcome,
    ReleaseAnalysisResult as PublicReleaseAnalysisResult,
    ReleaseDiffAllOutcome as PublicReleaseDiffAllOutcome,
    ReleaseDiffAllResult as PublicReleaseDiffAllResult,
    ReleasePlan as PublicReleasePlan,
    ReleasePlanOutcome as PublicReleasePlanOutcome,
    ReleasePlanPackage as PublicReleasePlanPackage,
    ReleasePlanRegistryMetadata as PublicReleasePlanRegistryMetadata,
    ReleasePlanResult as PublicReleasePlanResult,
    ResolveAndLinkAllOptions as PublicResolveAndLinkAllOptions,
    ResolveAndLinkAllOutcome as PublicResolveAndLinkAllOutcome,
    ResolveAndLinkAllResult as PublicResolveAndLinkAllResult,
    ResolveAndLinkFailure as PublicResolveAndLinkFailure
} from '../../packtory/packtory.ts';
import type { ResolvedPackage as PublicResolvedPackage } from '../../packtory/resolved-package.ts';
import { readContinuousIntegrationEnvironment } from '../../bundle-emitter/repository-coherence.ts';
import type { PublicProgressBroadcastConsumer } from '../../progress/progress-broadcaster.ts';
import { buildPacktoryComposition } from '../packtory.composition.ts';

const { packtory, progressBroadcaster } = buildPacktoryComposition({
    continuousIntegrationEnvironment: readContinuousIntegrationEnvironment(process.env)
});

export const {
    analyzeReleaseAgainstLatestPublished,
    buildAndPublishAll,
    diffAgainstLatestPublished,
    inspectPackageDependencies,
    inspectPackageFiles,
    inspectPackageSymbols,
    inspectPackageSideEffects,
    planReleaseAgainstLatestPublished,
    resolveAndLinkAll,
    packAllPackages,
    packPackage
} = packtory;
export const progressBroadcastConsumer: PublicProgressBroadcastConsumer = progressBroadcaster.consumer;

export type PacktoryConfiguration = PublicPacktoryConfiguration;
export type VersionProviderInput = versioning.VersionProviderInput;
export type BuildAndPublishAllOptions = PublicBuildAndPublishAllOptions;
export type BuildReport = PublicBuildReport;
export type PackageDependencyInspection = PublicPackageDependencyInspection;
export type PackageDependencyInspectionOutcome = PublicPackageDependencyInspectionOutcome;
export type PackageDependencyInspectionResult = PublicPackageDependencyInspectionResult;
export type PackageFileInspection = PublicPackageFileInspection;
export type PackageSymbolInspection = PublicPackageSymbolInspection;
export type PackageSymbolInspectionOutcome = PublicPackageSymbolInspectionOutcome;
export type PackageSymbolInspectionResult = PublicPackageSymbolInspectionResult;
export type PackageFileInspectionOutcome = PublicPackageFileInspectionOutcome;
export type PackageFileInspectionResult = PublicPackageFileInspectionResult;
export type PackageSideEffectsInspection = PublicPackageSideEffectsInspection;
export type PackageSideEffectsInspectionOutcome = PublicPackageSideEffectsInspectionOutcome;
export type PackageSideEffectsInspectionResult = PublicPackageSideEffectsInspectionResult;
export type PackageReleaseAnalysis = PublicPackageReleaseAnalysis;
export type PackageReleaseAnalysisClassification = PublicPackageReleaseAnalysisClassification;
export type PackAllOutcome = PublicPackAllOutcome;
export type PackAllPublicOptions = PublicPackAllPublicOptions;
export type PackAllResult = PublicPackAllResult;
export type PackOutcome = PublicPackOutcome;
export type PackPublicOptions = PublicPackPublicOptions;
export type PackResult = PublicPackResult;
export type PublishAllOutcome = PublicPublishAllOutcome;
export type PublishAllResult = PublicPublishAllResult;
export type ReleaseAnalysis = PublicReleaseAnalysis;
export type ReleaseAnalysisOutcome = PublicReleaseAnalysisOutcome;
export type ReleaseAnalysisResult = PublicReleaseAnalysisResult;
export type ReleaseDiffAllOutcome = PublicReleaseDiffAllOutcome;
export type ReleaseDiffAllResult = PublicReleaseDiffAllResult;
export type ReleasePlan = PublicReleasePlan;
export type ReleasePlanOutcome = PublicReleasePlanOutcome;
export type ReleasePlanPackage = PublicReleasePlanPackage;
export type ReleasePlanRegistryMetadata = PublicReleasePlanRegistryMetadata;
export type ReleasePlanResult = PublicReleasePlanResult;
export type ResolveAndLinkAllOptions = PublicResolveAndLinkAllOptions;
export type ResolveAndLinkAllOutcome = PublicResolveAndLinkAllOutcome;
export type ResolveAndLinkAllResult = PublicResolveAndLinkAllResult;
export type ResolveAndLinkFailure = PublicResolveAndLinkFailure;
export type ResolvedPackage = PublicResolvedPackage;
