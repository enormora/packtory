import { Result } from 'true-myth';
import { ensureError } from '../common/error-normalization.ts';
import type { ValidConfigurationResult } from '../configuration/validation.ts';
import type { BuildAndPublishResult } from './package-processor.ts';
import type { ResolveAndLinkFailure } from './packtory-results.ts';
import { mapResolvePartialFailure, succeededResultsFrom } from './partial-result.ts';
import type { ResolvedPackage } from './resolved-package.ts';
import type { PartialError } from './scheduler.ts';
import {
    prepareReleasePackages,
    type PublishStageDependencies,
    type PublishStageResult
} from './stages/publish-stage.ts';

type ReleaseProjectionFailure<T> = PartialError<T> & { readonly type: 'partial'; };
type ResolutionFailure = Exclude<ResolveAndLinkFailure, { readonly type: 'partial'; }>;
type PreparationFailure = ReleaseProjectionFailure<never> | ResolutionFailure;

export type ResolveReleasePackages = (
    configuration: ValidConfigurationResult
) => Promise<Result<readonly ResolvedPackage[], ResolveAndLinkFailure>>;

export type PreparedRelease = {
    readonly resolvedPackages: readonly ResolvedPackage[];
    readonly packages: readonly BuildAndPublishResult[];
    readonly finish: <T>(
        result: Result<readonly T[], PartialError<T>>
    ) => Result<readonly T[], ReleaseProjectionFailure<T>>;
    readonly project: <T>(
        projectPackage: (buildResult: BuildAndPublishResult) => Promise<T> | T
    ) => Promise<Result<readonly T[], ReleaseProjectionFailure<T>>>;
};

async function projectPackages<T>(
    packages: readonly BuildAndPublishResult[],
    projectPackage: (buildResult: BuildAndPublishResult) => Promise<T> | T
): Promise<Result<readonly T[], PartialError<T>>> {
    const succeeded: T[] = [];
    const failures: Error[] = [];
    for (const entry of packages) {
        try {
            succeeded.push(await projectPackage(entry));
        } catch (error: unknown) {
            failures.push(ensureError(error));
        }
    }
    return failures.length === 0 ? Result.ok(succeeded) : Result.err({ failures, succeeded, skipped: [] });
}

function createPreparedRelease(
    resolvedPackages: readonly ResolvedPackage[],
    preparation: PublishStageResult
): PreparedRelease {
    const packages = succeededResultsFrom(preparation);
    function finish<T>(
        result: Result<readonly T[], PartialError<T>>
    ): Result<readonly T[], ReleaseProjectionFailure<T>> {
        if (preparation.isErr) {
            return Result.err({
                type: 'partial',
                succeeded: succeededResultsFrom(result),
                skipped: preparation.error.skipped,
                failures: preparation.error.failures
            });
        }
        return result.mapErr(function (error) {
            return { type: 'partial', ...error } as const;
        });
    }
    return {
        resolvedPackages,
        packages,
        finish,
        async project(projectPackage) {
            return finish(await projectPackages(packages, projectPackage));
        }
    };
}

export async function prepareRelease(
    dependencies: PublishStageDependencies,
    configuration: ValidConfigurationResult,
    resolve: ResolveReleasePackages
): Promise<Result<PreparedRelease, PreparationFailure>> {
    const resolved = await resolve(configuration);
    if (resolved.isErr) {
        return Result.err(
            resolved.error.type === 'partial' ? mapResolvePartialFailure<never>(resolved.error) : resolved.error
        );
    }
    const preparation = await prepareReleasePackages(dependencies, configuration, resolved.value, {
        stage: false,
        emitDoneEvents: true
    });
    return Result.ok(createPreparedRelease(resolved.value, preparation.result));
}
