import type { Result } from 'true-myth';
import type { PackFormat } from '../pack-emitter/pack-emitter.ts';
import type { ProgressBroadcaster as ProgressBroadcasterBase } from '../progress/progress-broadcaster.ts';
import type { BuildReport as ReportBuildReport } from '../report/aggregator/report-types.ts';
import type { PackageReleaseDiff } from '../report/release-diff/file-set-diff.ts';
import type { BuildAndPublishResult } from './package-processor.ts';
import type { CheckError, ResolvedPackage } from './resolved-package.ts';
import type { PartialError } from './scheduler.ts';

export type PackPackageFailure =
    | { readonly type: 'bundle-dependencies-unsupported'; readonly packageName: string }
    | { readonly type: 'package-not-found'; readonly packageName: string };

export type BuildAndPublishAllOptions = {
    readonly dryRun: boolean;
    readonly collectReport?: boolean;
};

export type ResolveAndLinkAllOptions = {
    readonly collectReport?: boolean;
};

export type BuildReport = ReportBuildReport;

export function configError(issues: readonly string[]): ConfigError {
    return { type: 'config', issues };
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
    type: 'config';
    issues: readonly string[];
};

export type PublishFailure = CheckError | ConfigError | (PartialError<BuildAndPublishResult> & { type: 'partial' });

export type PublishAllResult = Result<readonly BuildAndPublishResult[], PublishFailure>;

export function publishPartialFailure(error: PartialError<BuildAndPublishResult>): PublishFailure {
    return { type: 'partial', ...error };
}

export type PartialErrorResult = {
    type: 'partial';
    error: PartialError<ResolvedPackage>;
};

export function resolvePartialFailure(error: PartialError<ResolvedPackage>): PartialErrorResult {
    return { type: 'partial', error };
}

export type ResolveAndLinkFailure = CheckError | ConfigError | PartialErrorResult;
export type ResolveAndLinkAllResult = Result<readonly ResolvedPackage[], ResolveAndLinkFailure>;

export type ReleaseDiffFailure = CheckError | ConfigError | (PartialError<PackageReleaseDiff> & { type: 'partial' });
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

export function releaseDiffPartialFailure(error: PartialError<PackageReleaseDiff>): ReleaseDiffFailure {
    return { type: 'partial', ...error };
}

export type PackPublicOptions = {
    readonly packageName: string;
    readonly format: PackFormat;
    readonly outputPath: string;
    readonly version: string;
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
    buildAndPublishAll: (config: unknown, options: BuildAndPublishAllOptions) => Promise<PublishAllOutcome>;
    diffAgainstLatestPublished: (config: unknown) => Promise<ReleaseDiffAllOutcome>;
    resolveAndLinkAll: (config: unknown, options?: ResolveAndLinkAllOptions) => Promise<ResolveAndLinkAllOutcome>;
    packPackage: (config: unknown, options: PackPublicOptions) => Promise<PackOutcome>;
};

export type ProgressBroadcaster = ProgressBroadcasterBase;
