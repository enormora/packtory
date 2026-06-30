import { Result } from 'true-myth';
import type { PublicationOutcome } from '../bundle-emitter/publication-outcome.ts';
import type { ConfigWithGraph } from '../config/validation.ts';
import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.ts';
import type { PackageConfig } from '../config/config.ts';
import type { PublishedReleaseStatus } from './published-release-state.ts';

export type PartialError<TResult> = {
    readonly succeeded: readonly TResult[];
    readonly failures: readonly Error[];
};

export type Scheduler = {
    runForEachScheduledPackage: <
        TResult,
        TNext,
        TOptions,
        TConfig extends { readonly packages: readonly PackageConfig[]; }
    >(
        params: RunForEachScheduledPackageParams<TResult, TNext, TOptions, TConfig>
    ) => Promise<Result<readonly TResult[], PartialError<TResult>>>;
};

type SchedulerDependencies = {
    readonly progressBroadcastProvider: ProgressBroadcastProvider;
};

function toError(error: unknown): Error {
    if (error instanceof Error) {
        return error;
    }

    return new Error('Unknown error');
}

type PackageSuccessCollector<TResult, TOptions> = {
    readonly succeeded: readonly PackageSuccess<TResult, TOptions>[];
    readonly succeededResults: readonly TResult[];
    readonly failures: readonly Error[];
};

function collectPackageSuccesses<TResult, TOptions>(
    results: readonly PromiseSettledResult<PackageSuccess<TResult, TOptions>>[]
): PackageSuccessCollector<TResult, TOptions> {
    return {
        succeeded: results.flatMap(function (result) {
            return result.status === 'fulfilled' ? [ result.value ] : [];
        }),
        succeededResults: results.flatMap(function (result) {
            return result.status === 'fulfilled' ? [ result.value.result ] : [];
        }),
        failures: results.flatMap(function (result) {
            return result.status === 'rejected' ? [ toError(result.reason) ] : [];
        })
    };
}

function summarizeGenerationResults<TResult, TOptions>(
    results: readonly PromiseSettledResult<PackageSuccess<TResult, TOptions>>[]
): Result<readonly PackageSuccess<TResult, TOptions>[], PartialError<TResult>> {
    const collected = collectPackageSuccesses(results);
    if (collected.failures.length > 0) {
        return Result.err({ succeeded: collected.succeededResults, failures: collected.failures });
    }

    return Result.ok(collected.succeeded);
}

type PackageExecutionContext<TNext, TConfig extends { readonly packages: readonly PackageConfig[]; }> = {
    readonly packageName: string;
    readonly existing: readonly TNext[];
    readonly config: ConfigWithGraph<TConfig>;
};

type PackageSuccess<TResult, TOptions> = {
    readonly packageName: string;
    readonly options: TOptions;
    readonly result: TResult;
};

type ProgressEventReturnValue = {
    readonly version: string;
    readonly status: PublishedReleaseStatus;
    readonly publication: PublicationOutcome;
};

type GenerationFailure<TResult> = Result<never, PartialError<TResult>>;

type ResultCollector<T> = {
    readonly push: (...values: readonly T[]) => unknown;
};

type SelectNextInput<TResult, TOptions> = {
    readonly result: TResult;
    readonly options: TOptions;
};

type ProgressEventInput<TResult, TOptions> = {
    readonly packageName: string;
    readonly result: TResult;
    readonly options: TOptions;
};

type CreateProgressEvent<TResult, TOptions> = (
    params: ProgressEventInput<TResult, TOptions>
) => ProgressEventReturnValue;

type RunForEachScheduledPackageParams<
    TResult,
    TNext,
    TOptions,
    TConfig extends { readonly packages: readonly PackageConfig[]; }
> = {
    readonly config: ConfigWithGraph<TConfig>;
    readonly createOptions: (context: PackageExecutionContext<TNext, TConfig>) => TOptions;
    readonly execute: (options: TOptions) => Promise<TResult>;
    readonly selectNext: (params: SelectNextInput<TResult, TOptions>) => TNext;
    readonly createProgressEvent?: CreateProgressEvent<TResult, TOptions> | undefined;
    readonly emitScheduledEvents?: boolean;
};

export function createScheduler(dependencies: SchedulerDependencies): Scheduler {
    const { progressBroadcastProvider } = dependencies;

    async function executeAndReportError<TResult, TOptions>(
        packageName: string,
        options: TOptions,
        execute: (options: TOptions) => Promise<TResult>
    ): Promise<TResult> {
        try {
            return await execute(options);
        } catch (error: unknown) {
            progressBroadcastProvider.emit('error', { packageName, error: toError(error) });
            throw error;
        }
    }

    async function runForGeneration<
        TResult,
        TNext,
        TOptions,
        TConfig extends { readonly packages: readonly PackageConfig[]; }
    >(
        packageNames: readonly string[],
        config: ConfigWithGraph<TConfig>,
        existingItems: readonly TNext[],
        params: RunForEachScheduledPackageParams<TResult, TNext, TOptions, TConfig>
    ): Promise<Result<readonly PackageSuccess<TResult, TOptions>[], PartialError<TResult>>> {
        const executePackage = async function (packageName: string): Promise<PackageSuccess<TResult, TOptions>> {
            const options = params.createOptions({ packageName, existing: existingItems, config });
            const result = await executeAndReportError(packageName, options, params.execute);
            const progressEvent = params.createProgressEvent?.({ packageName, result, options });
            if (progressEvent !== undefined) {
                progressBroadcastProvider.emit('done', { packageName, ...progressEvent });
            }
            return { packageName, result, options };
        };

        const results = await Promise.allSettled(packageNames.map(executePackage));
        return summarizeGenerationResults(results);
    }

    function emitScheduledEventForAllPackages<TConfig extends { readonly packages: readonly PackageConfig[]; }>(
        config: ConfigWithGraph<TConfig>
    ): void {
        for (const packageConfig of config.packtoryConfig.packages) {
            progressBroadcastProvider.emit('scheduled', { packageName: packageConfig.name });
        }
    }

    function getExecutionPlan<TConfig extends { readonly packages: readonly PackageConfig[]; }>(
        config: ConfigWithGraph<TConfig>
    ): readonly (readonly string[])[] {
        const reverseGraph = config.packageGraph.reverse.bind(config.packageGraph);
        return reverseGraph().getTopologicalGenerations();
    }

    function shouldEmitScheduledEvents(emitScheduledEvents: boolean | undefined): boolean {
        return emitScheduledEvents ?? true;
    }

    function failGeneration<TResult>(
        succeeded: readonly TResult[],
        generationError: PartialError<TResult>
    ): GenerationFailure<TResult> {
        return Result.err({
            succeeded: [ ...succeeded, ...generationError.succeeded ],
            failures: generationError.failures
        });
    }

    function appendGenerationSuccesses<TResult, TNext, TOptions>(
        nextItems: ResultCollector<TNext>,
        succeededResults: ResultCollector<TResult>,
        succeeded: readonly PackageSuccess<TResult, TOptions>[],
        selectNext: (params: SelectNextInput<TResult, TOptions>) => TNext
    ): void {
        for (const entry of succeeded) {
            nextItems.push(selectNext({ result: entry.result, options: entry.options }));
            succeededResults.push(entry.result);
        }
    }

    async function runExecutionPlan<
        TResult,
        TNext,
        TOptions,
        TConfig extends { readonly packages: readonly PackageConfig[]; }
    >(
        config: ConfigWithGraph<TConfig>,
        params: RunForEachScheduledPackageParams<TResult, TNext, TOptions, TConfig>
    ): Promise<Result<readonly TResult[], PartialError<TResult>>> {
        const nextItems: TNext[] = [];
        const succeededResults: TResult[] = [];

        for (const generation of getExecutionPlan(config)) {
            const generationResult = await runForGeneration(generation, config, nextItems, params);
            if (generationResult.isErr) {
                return failGeneration(succeededResults, generationResult.error);
            }

            appendGenerationSuccesses(nextItems, succeededResults, generationResult.value, params.selectNext);
        }

        return Result.ok(succeededResults);
    }

    return {
        async runForEachScheduledPackage<
            TResult,
            TNext,
            TOptions,
            TConfig extends { readonly packages: readonly PackageConfig[]; }
        >(params: RunForEachScheduledPackageParams<TResult, TNext, TOptions, TConfig>) {
            const { config } = params;
            if (shouldEmitScheduledEvents(params.emitScheduledEvents)) {
                emitScheduledEventForAllPackages(config);
            }

            return runExecutionPlan(config, params);
        }
    };
}
