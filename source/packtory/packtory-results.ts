import type { Result } from 'true-myth';
import type { ProgressBroadcaster as ProgressBroadcasterBase } from '../progress/progress-broadcaster.ts';
import type { BuildReport as ReportBuildReport } from '../report/aggregator/report-types.ts';
import type { BuildAndPublishResult } from './package-processor.ts';
import type { CheckError, ResolvedPackage } from './resolved-package.ts';
import type { PartialError } from './scheduler.ts';

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

export type Packtory = {
    buildAndPublishAll: (config: unknown, options: BuildAndPublishAllOptions) => Promise<PublishAllOutcome>;
    resolveAndLinkAll: (config: unknown, options?: ResolveAndLinkAllOptions) => Promise<ResolveAndLinkAllOutcome>;
};

export type ProgressBroadcaster = ProgressBroadcasterBase;
