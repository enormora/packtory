import type { Result } from 'true-myth';
import type { PackFormat } from '../pack-emitter/pack-emitter.ts';
import type {
    ArtifactEntry,
    ProgressBroadcaster as ProgressBroadcasterBase
} from '../progress/progress-broadcaster.ts';
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
    outputFolderExists: 'output-folder-exists',
    outputRootNotDirectory: 'output-root-not-directory',
    packageNotFound: 'package-not-found',
    peerDependenciesUnsatisfied: 'peer-dependencies-unsatisfied',
    unsafeOutputFolder: 'unsafe-output-folder',
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

type BundleDependenciesUnsupportedFailure = {
    readonly type: typeof packPackageFailureType.bundleDependenciesUnsupported;
    readonly packageName: string;
};

type OutputFolderExistsFailure = {
    readonly type: typeof packPackageFailureType.outputFolderExists;
    readonly packageName: string;
    readonly outputPath: string;
};

type OutputRootNotDirectoryFailure = {
    readonly type: typeof packPackageFailureType.outputRootNotDirectory;
    readonly outputPath: string;
};

type UnsafeOutputFolderFailure = {
    readonly type: typeof packPackageFailureType.unsafeOutputFolder;
    readonly packageName: string;
    readonly outputPath: string;
};

type PackageNotFoundFailure = {
    readonly type: typeof packPackageFailureType.packageNotFound;
    readonly packageName: string;
};

type PackPackageFailures = readonly [
    PeerDependenciesUnsatisfiedFailure,
    VendorInvalidDependencyNameFailure,
    VendorSymlinkOutsidePackageFailure,
    BundleDependenciesUnsupportedFailure,
    OutputFolderExistsFailure,
    OutputRootNotDirectoryFailure,
    UnsafeOutputFolderFailure,
    PackageNotFoundFailure
];

export type PackPackageFailure = PackPackageFailures[number];

export type BuildAndPublishAllOptions = {
    readonly dryRun: boolean;
    readonly stage: boolean;
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
    readonly type: typeof configErrorType;
    readonly issues: readonly string[];
};

type PublishPartialFailure = PartialError<BuildAndPublishResult> & { readonly type: typeof partialFailureType; };

type PublishFailures = readonly [
    CheckError,
    ConfigError,
    PublishPartialFailure
];

export type PublishFailure = PublishFailures[number];

export type PublishAllResult = Result<readonly BuildAndPublishResult[], PublishFailure>;

export function publishPartialFailure(error: PartialError<BuildAndPublishResult>): PublishFailure {
    return { type: partialFailureType, ...error };
}

export type PartialErrorResult = {
    readonly type: typeof partialFailureType;
    readonly error: PartialError<ResolvedPackage>;
};

export function resolvePartialFailure(error: PartialError<ResolvedPackage>): PartialErrorResult {
    return { type: partialFailureType, error };
}

export type ResolveAndLinkFailure = CheckError | ConfigError | PartialErrorResult;
export type ResolveAndLinkAllResult = Result<readonly ResolvedPackage[], ResolveAndLinkFailure>;

type ReleaseDiffPartialFailure = PartialError<PackageReleaseDiff> & { readonly type: typeof partialFailureType; };

type ReleaseDiffFailures = readonly [
    CheckError,
    ConfigError,
    ReleaseDiffPartialFailure
];

export type ReleaseDiffFailure = ReleaseDiffFailures[number];
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

type ReleaseAnalysisPartialFailure = PartialError<PackageReleaseAnalysis> & {
    readonly type: typeof partialFailureType;
};

type ReleaseAnalysisFailures = readonly [
    CheckError,
    ConfigError,
    ReleaseAnalysisPartialFailure
];

export type ReleaseAnalysisFailure = ReleaseAnalysisFailures[number];
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

export type ReleasePlanRegistryMetadata = {
    readonly version: string;
    readonly publishedAt: Date | undefined;
    readonly gitHead: string | undefined;
};

type ReleasePlanDependencyUpdate = {
    readonly name: string;
    readonly version: string;
};

export type ReleasePlanPackage = {
    readonly name: string;
    readonly previousVersion: string | undefined;
    readonly nextVersion: string;
    readonly artifactState: 'changed' | 'first-publish' | 'unchanged';
    readonly releaseClassification: PackageReleaseAnalysisClassification;
    readonly changed: boolean;
    readonly previousGitHead: string | undefined;
    readonly currentGitHead: string | undefined;
    readonly latestRegistryMetadata: ReleasePlanRegistryMetadata | undefined;
    readonly artifactFiles: readonly string[];
    readonly changedArtifactFiles: readonly string[];
    readonly sourceFiles: readonly string[];
    readonly changelogDependencyNames: readonly string[];
    readonly changelogDependencyUpdates: readonly ReleasePlanDependencyUpdate[];
    readonly changelogSourceFiles: readonly string[];
};

export type ReleasePlan = {
    readonly packages: readonly ReleasePlanPackage[];
};

type ReleasePlanPartialFailure = PartialError<ReleasePlanPackage> & { readonly type: typeof partialFailureType; };

type ReleasePlanFailures = readonly [
    CheckError,
    ConfigError,
    ReleasePlanPartialFailure
];

export type ReleasePlanFailure = ReleasePlanFailures[number];
export type ReleasePlanResult = Result<ReleasePlan, ReleasePlanFailure>;

export type ReleasePlanOutcome = {
    readonly result: ReleasePlanResult;
    readonly getReport: () => BuildReport;
};

export function createReleasePlanOutcome(result: ReleasePlanResult, getReport: () => BuildReport): ReleasePlanOutcome {
    return { result, getReport };
}

export function releaseDiffPartialFailure(error: PartialError<PackageReleaseDiff>): ReleaseDiffFailure {
    return { type: partialFailureType, ...error };
}

export function releaseAnalysisPartialFailure(error: PartialError<PackageReleaseAnalysis>): ReleaseAnalysisFailure {
    return { type: partialFailureType, ...error };
}

export function releasePlanPartialFailure(error: PartialError<ReleasePlanPackage>): ReleasePlanFailure {
    return { type: partialFailureType, ...error };
}

export type PackPublicOptions = {
    readonly packageName: string;
    readonly format: PackFormat;
    readonly outputPath: string;
    readonly version: string;
    readonly vendorDependencies: boolean;
};

export type PackAllPublicOptions = {
    readonly outputPath: string;
    readonly version: string;
    readonly vendorDependencies: boolean;
};

export type PackAllSuccess = {
    readonly packageNames: readonly string[];
};

export type PackFailure = CheckError | ConfigError | PackPackageFailure | PartialErrorResult;

export type PackResult = Result<undefined, PackFailure>;

export type PackAllResult = Result<PackAllSuccess, PackFailure>;

export type PackOutcome = {
    readonly result: PackResult;
};

export function createPackOutcome(result: PackResult): PackOutcome {
    return { result };
}

export type PackAllOutcome = {
    readonly result: PackAllResult;
};

export function createPackAllOutcome(result: PackAllResult): PackAllOutcome {
    return { result };
}

export type PackageTree = {
    readonly packageName: string;
    readonly entries: readonly ArtifactEntry[];
};

export type PackageTreeFailure = CheckError | ConfigError | PackPackageFailure | PartialErrorResult;

export type PackageTreeResult = Result<PackageTree, PackageTreeFailure>;

export type PackageTreeOutcome = {
    readonly result: PackageTreeResult;
};

export function createPackageTreeOutcome(result: PackageTreeResult): PackageTreeOutcome {
    return { result };
}

export type Packtory = {
    analyzeReleaseAgainstLatestPublished: (config: unknown) => Promise<ReleaseAnalysisOutcome>;
    buildAndPublishAll: (config: unknown, options: BuildAndPublishAllOptions) => Promise<PublishAllOutcome>;
    diffAgainstLatestPublished: (config: unknown) => Promise<ReleaseDiffAllOutcome>;
    planReleaseAgainstLatestPublished: (config: unknown) => Promise<ReleasePlanOutcome>;
    resolveAndLinkAll: (config: unknown, options?: ResolveAndLinkAllOptions) => Promise<ResolveAndLinkAllOutcome>;
    packPackage: (config: unknown, options: PackPublicOptions) => Promise<PackOutcome>;
    packAllPackages: (config: unknown, options: PackAllPublicOptions) => Promise<PackAllOutcome>;
    inspectPackageTree: (config: unknown, packageName: string) => Promise<PackageTreeOutcome>;
};

export type ProgressBroadcaster = ProgressBroadcasterBase;
