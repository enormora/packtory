import type { Result } from 'true-myth';
import type { PackFormat } from '../pack-emitter/pack-emitter.ts';
import type { ProgressBroadcaster as ProgressBroadcasterBase } from '../progress/progress-broadcaster.ts';
import type { BuildReport as ReportBuildReport } from '../report/aggregator/report-types.ts';
import type { PackageReleaseDiff } from '../report/release-diff/file-set-diff.ts';
import type { BuildAndPublishResult } from './package-processor.ts';
import type { CheckError, ResolvedPackage } from './resolved-package.ts';
import type { PartialError } from './scheduler.ts';

export type UnsatisfiedPeerDependency = {
    readonly packageName: string;
    readonly peer: string;
};

export const packPackageFailureType = {
    bundleDependenciesUnsupported: 'bundle-dependencies-unsupported',
    packageNotFound: 'package-not-found',
    peerDependenciesUnsatisfied: 'peer-dependencies-unsatisfied',
    vendorInvalidDependencyName: 'vendor-invalid-dependency-name',
    vendorSymlinkTargetOutsidePackage: 'vendor-symlink-target-outside-package'
} as const;

type PeerDependenciesUnsatisfiedFailure = {
    readonly type: typeof packPackageFailureType.peerDependenciesUnsatisfied;
    readonly packageName: string;
    readonly items: readonly UnsatisfiedPeerDependency[];
};

type VendorSymlinkOutsidePackageFailure = {
    readonly type: typeof packPackageFailureType.vendorSymlinkTargetOutsidePackage;
    readonly packageName: string;
    readonly vendoredPackageName: string;
    readonly entryRelativePath: string;
    readonly resolvedTargetPath: string;
};

type VendorInvalidDependencyNameFailure = {
    readonly type: typeof packPackageFailureType.vendorInvalidDependencyName;
    readonly packageName: string;
    readonly sourcePackageName: string | undefined;
    readonly invalidDependencyName: string;
};

export type PackPackageFailure =
    | PeerDependenciesUnsatisfiedFailure
    | VendorInvalidDependencyNameFailure
    | VendorSymlinkOutsidePackageFailure
    | { readonly type: typeof packPackageFailureType.bundleDependenciesUnsupported; readonly packageName: string }
    | { readonly type: typeof packPackageFailureType.packageNotFound; readonly packageName: string };

export type BuildAndPublishAllOptions = {
    readonly dryRun: boolean;
    readonly collectReport?: boolean;
};

export type ResolveAndLinkAllOptions = {
    readonly collectReport?: boolean;
};

export type BuildReport = ReportBuildReport;

export const checksErrorType = 'checks';
export const configErrorType = 'config';
export const partialFailureType = 'partial';
export const previewResultType = {
    checks: checksErrorType,
    config: configErrorType,
    partial: partialFailureType,
    success: 'success'
} as const;
export const releaseAnalysisClassification = {
    dependencyOnly: 'dependency-only',
    firstPublish: 'first-publish',
    substantive: 'substantive',
    unchanged: 'unchanged'
} as const;

export function configError(issues: readonly string[]): ConfigError {
    return { type: configErrorType, issues };
}

export type PublishAllOutcome = {
    readonly result: PublishAllResult;
    readonly getReport: () => BuildReport | undefined;
};

export function createPublishAllOutcome(
    result: PublishAllResult,
    getReport: () => BuildReport | undefined
): PublishAllOutcome {
    return { result, getReport };
}

export type ResolveAndLinkAllOutcome = {
    readonly result: ResolveAndLinkAllResult;
    readonly getReport: () => BuildReport | undefined;
};

export function createResolveAndLinkAllOutcome(
    result: ResolveAndLinkAllResult,
    getReport: () => BuildReport | undefined
): ResolveAndLinkAllOutcome {
    return { result, getReport };
}

export type ConfigError = {
    type: typeof configErrorType;
    issues: readonly string[];
};

export type PublishFailure =
    | CheckError
    | ConfigError
    | (PartialError<BuildAndPublishResult> & { type: typeof partialFailureType });

export type PublishAllResult = Result<readonly BuildAndPublishResult[], PublishFailure>;

export function publishPartialFailure(error: PartialError<BuildAndPublishResult>): PublishFailure {
    return { type: partialFailureType, ...error };
}

export type PartialErrorResult = {
    type: typeof partialFailureType;
    error: PartialError<ResolvedPackage>;
};

export function resolvePartialFailure(error: PartialError<ResolvedPackage>): PartialErrorResult {
    return { type: partialFailureType, error };
}

export type ResolveAndLinkFailure = CheckError | ConfigError | PartialErrorResult;
export type ResolveAndLinkAllResult = Result<readonly ResolvedPackage[], ResolveAndLinkFailure>;

export type ReleaseDiffFailure =
    | CheckError
    | ConfigError
    | (PartialError<PackageReleaseDiff> & { type: typeof partialFailureType });
export type ReleaseDiffAllResult = Result<readonly PackageReleaseDiff[], ReleaseDiffFailure>;

export type ReleaseDiffAllOutcome = {
    readonly result: ReleaseDiffAllResult;
    readonly getReport: () => BuildReport;
};

export function createReleaseDiffAllOutcome(
    result: ReleaseDiffAllResult,
    getReport: () => BuildReport
): ReleaseDiffAllOutcome {
    return { result, getReport };
}

export type PackageReleaseAnalysisClassification =
    (typeof releaseAnalysisClassification)[keyof typeof releaseAnalysisClassification];

export type PackageReleaseAnalysis = {
    readonly classification: PackageReleaseAnalysisClassification;
    readonly latestPublishedAt?: Date | undefined;
    readonly latestPublishedVersion?: string | undefined;
    readonly name: string;
};

export type ReleaseAnalysis = {
    readonly classification: PackageReleaseAnalysisClassification;
    readonly mostRecentPublishedAt?: Date | undefined;
    readonly packageAnalyses: readonly PackageReleaseAnalysis[];
};

export type ReleaseAnalysisFailure =
    | CheckError
    | ConfigError
    | (PartialError<PackageReleaseAnalysis> & { type: typeof partialFailureType });
export type ReleaseAnalysisResult = Result<ReleaseAnalysis, ReleaseAnalysisFailure>;

export type ReleaseAnalysisOutcome = {
    readonly result: ReleaseAnalysisResult;
    readonly getReport: () => BuildReport;
};

export function createReleaseAnalysisOutcome(
    result: ReleaseAnalysisResult,
    getReport: () => BuildReport
): ReleaseAnalysisOutcome {
    return { result, getReport };
}

export function releaseDiffPartialFailure(error: PartialError<PackageReleaseDiff>): ReleaseDiffFailure {
    return { type: partialFailureType, ...error };
}

export function releaseAnalysisPartialFailure(error: PartialError<PackageReleaseAnalysis>): ReleaseAnalysisFailure {
    return { type: partialFailureType, ...error };
}

export type PackPublicOptions = {
    readonly packageName: string;
    readonly format: PackFormat;
    readonly outputPath: string;
    readonly version: string;
    readonly vendorDependencies: boolean;
};

export type PackFailure = CheckError | ConfigError | PackPackageFailure | PartialErrorResult;

export type PackResult = Result<undefined, PackFailure>;

export type PackOutcome = {
    readonly result: PackResult;
};

export function createPackOutcome(result: PackResult): PackOutcome {
    return { result };
}

export type Packtory = {
    analyzeReleaseAgainstLatestPublished: (config: unknown) => Promise<ReleaseAnalysisOutcome>;
    buildAndPublishAll: (config: unknown, options: BuildAndPublishAllOptions) => Promise<PublishAllOutcome>;
    diffAgainstLatestPublished: (config: unknown) => Promise<ReleaseDiffAllOutcome>;
    resolveAndLinkAll: (config: unknown, options?: ResolveAndLinkAllOptions) => Promise<ResolveAndLinkAllOutcome>;
    packPackage: (config: unknown, options: PackPublicOptions) => Promise<PackOutcome>;
};

export type ProgressBroadcaster = ProgressBroadcasterBase;
