import type { PacktoryConfig as PublicPacktoryConfig } from '../../config/config.ts';
import type {
    BuildAndPublishAllOptions as PublicBuildAndPublishAllOptions,
    BuildReport as PublicBuildReport,
    PackageReleaseAnalysis as PublicPackageReleaseAnalysis,
    PackageReleaseAnalysisClassification as PublicPackageReleaseAnalysisClassification,
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
import { readCiEnvironment } from '../../bundle-emitter/repository-coherence.ts';
import type { PublicProgressBroadcastConsumer } from '../../progress/progress-broadcaster.ts';
import { buildPacktoryComposition } from '../packtory.composition.ts';

const { packtory, progressBroadcaster } = buildPacktoryComposition({
    ciEnvironment: readCiEnvironment(process.env)
});

export const {
    analyzeReleaseAgainstLatestPublished,
    buildAndPublishAll,
    diffAgainstLatestPublished,
    planReleaseAgainstLatestPublished,
    resolveAndLinkAll,
    packPackage
} = packtory;
export const progressBroadcastConsumer: PublicProgressBroadcastConsumer = progressBroadcaster.consumer;

export type PacktoryConfig = PublicPacktoryConfig;
export type BuildAndPublishAllOptions = PublicBuildAndPublishAllOptions;
export type BuildReport = PublicBuildReport;
export type PackageReleaseAnalysis = PublicPackageReleaseAnalysis;
export type PackageReleaseAnalysisClassification = PublicPackageReleaseAnalysisClassification;
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
