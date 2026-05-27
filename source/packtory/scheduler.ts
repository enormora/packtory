import { Result } from 'true-myth';
import type { ConfigWithGraph } from '../config/validation.ts';
import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.ts';
import type { PackageConfig } from '../config/config.ts';
import type { PublishedReleaseStatus } from './published-release-state.ts';

export type PartialError<TResult> = {
    readonly succeeded: readonly TResult[];
    readonly failures: readonly Error[];
};

export type Scheduler = {
    runForEachScheduledPackage: <TResult, TNext, TOptions, TConfig extends { packages: readonly PackageConfig[] }>(
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

type GenerationSummary<TResult, TOptions> = {
    readonly succeeded: PackageSuccess<TResult, TOptions>[];
    readonly succeededResults: TResult[];
    readonly failures: Error[];
};

function createGenerationSummary<TResult, TOptions>(): GenerationSummary<TResult, TOptions> {
    return {
        succeeded: [],
        succeededResults: [],
        failures: []
    };
}

function recordGenerationResult<TResult, TOptions>(
    summary: GenerationSummary<TResult, TOptions>,
    result: PromiseSettledResult<PackageSuccess<TResult, TOptions>>
): void {
    if (result.status === 'fulfilled') {
        summary.succeeded.push(result.value);
        summary.succeededResults.push(result.value.result);
        return;
    }

    summary.failures.push(toError(result.reason));
}

function summarizeCollectedResults<TResult, TOptions>(
    summary: GenerationSummary<TResult, TOptions>
): Result<readonly PackageSuccess<TResult, TOptions>[], PartialError<TResult>> {
    if (summary.failures.length > 0) {
        return Result.err({
            succeeded: summary.succeededResults,
            failures: summary.failures
        });
    }

    return Result.ok(summary.succeeded);
}

function summarizeGenerationResults<TResult, TOptions>(
    results: readonly PromiseSettledResult<PackageSuccess<TResult, TOptions>>[]
): Result<readonly PackageSuccess<TResult, TOptions>[], PartialError<TResult>> {
    const summary = createGenerationSummary<TResult, TOptions>();

    for (const result of results) {
        recordGenerationResult(summary, result);
    }

    return summarizeCollectedResults(summary);
}

type PackageExecutionContext<TNext, TConfig extends { packages: readonly PackageConfig[] }> = {
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
    version: string;
    status: PublishedReleaseStatus;
};

type SchedulerState<TResult, TNext> = {
    readonly nextItems: TNext[];
    readonly succeeded: TResult[];
};

type GenerationFailure<TResult> = Result<never, PartialError<TResult>>;

type RunForEachScheduledPackageParams<
    TResult,
    TNext,
    TOptions,
    TConfig extends { packages: readonly PackageConfig[] }
> = {
    readonly config: ConfigWithGraph<TConfig>;
    readonly createOptions: (context: PackageExecutionContext<TNext, TConfig>) => TOptions;
    readonly execute: (options: TOptions) => Promise<TResult>;
    readonly selectNext: (params: { result: TResult; options: TOptions }) => TNext;
    readonly createProgressEvent?:
        | ((params: { packageName: string; result: TResult; options: TOptions }) => ProgressEventReturnValue)
        | undefined;
    readonly emitScheduledEvents?: boolean;
};

export function createScheduler(dependencies: SchedulerDependencies): Scheduler {
    const { progressBroadcastProvider } = dependencies;

    async function runForGeneration<TResult, TNext, TOptions, TConfig extends { packages: readonly PackageConfig[] }>(
        packageNames: readonly string[],
        config: ConfigWithGraph<TConfig>,
        existingItems: readonly TNext[],
        params: RunForEachScheduledPackageParams<TResult, TNext, TOptions, TConfig>
    ): Promise<Result<readonly PackageSuccess<TResult, TOptions>[], PartialError<TResult>>> {
        const executePackage = async (packageName: string): Promise<PackageSuccess<TResult, TOptions>> => {
            const options = params.createOptions({ packageName, existing: existingItems, config });
            try {
                const result = await params.execute(options);
                const progressEvent = params.createProgressEvent?.({ packageName, result, options });
                if (progressEvent !== undefined) {
                    progressBroadcastProvider.emit('done', { packageName, ...progressEvent });
                }
                return { packageName, result, options } satisfies PackageSuccess<TResult, TOptions>;
            } catch (error: unknown) {
                progressBroadcastProvider.emit('error', { packageName, error: toError(error) });
                throw error;
            }
        };

        const results = await Promise.allSettled(packageNames.map(executePackage));
        return summarizeGenerationResults(results);
    }

    function emitScheduledEventForAllPackages<TConfig extends { packages: readonly PackageConfig[] }>(
        config: ConfigWithGraph<TConfig>
    ): void {
        for (const packageConfig of config.packtoryConfig.packages) {
            progressBroadcastProvider.emit('scheduled', { packageName: packageConfig.name });
        }
    }

    function getExecutionPlan<TConfig extends { packages: readonly PackageConfig[] }>(
        config: ConfigWithGraph<TConfig>
    ): readonly (readonly string[])[] {
        const reverseGraph = config.packageGraph.reverse.bind(config.packageGraph);
        return reverseGraph().getTopologicalGenerations();
    }

    function shouldEmitScheduledEvents(emitScheduledEvents: boolean | undefined): boolean {
        return emitScheduledEvents ?? true;
    }

    function createSchedulerState<TResult, TNext>(): SchedulerState<TResult, TNext> {
        return { nextItems: [], succeeded: [] };
    }

    function failGeneration<TResult, TNext>(
        state: SchedulerState<TResult, TNext>,
        generationError: PartialError<TResult>
    ): GenerationFailure<TResult> {
        return Result.err({
            succeeded: [...state.succeeded, ...generationError.succeeded],
            failures: generationError.failures
        });
    }

    function appendGenerationSuccesses<TResult, TNext, TOptions>(
        state: SchedulerState<TResult, TNext>,
        succeeded: readonly PackageSuccess<TResult, TOptions>[],
        selectNext: (params: { result: TResult; options: TOptions }) => TNext
    ): void {
        for (const entry of succeeded) {
            state.nextItems.push(selectNext({ result: entry.result, options: entry.options }));
            state.succeeded.push(entry.result);
        }
    }

    async function runExecutionPlan<TResult, TNext, TOptions, TConfig extends { packages: readonly PackageConfig[] }>(
        config: ConfigWithGraph<TConfig>,
        params: RunForEachScheduledPackageParams<TResult, TNext, TOptions, TConfig>
    ): Promise<Result<readonly TResult[], PartialError<TResult>>> {
        const state = createSchedulerState<TResult, TNext>();

        for (const generation of getExecutionPlan(config)) {
            const generationResult = await runForGeneration(generation, config, state.nextItems, params);
            if (generationResult.isErr) {
                return failGeneration(state, generationResult.error);
            }

            appendGenerationSuccesses(state, generationResult.value, params.selectNext);
        }

        return Result.ok(state.succeeded);
    }

    return {
        async runForEachScheduledPackage<
            TResult,
            TNext,
            TOptions,
            TConfig extends { packages: readonly PackageConfig[] }
        >(params: RunForEachScheduledPackageParams<TResult, TNext, TOptions, TConfig>) {
            const { config } = params;
            if (shouldEmitScheduledEvents(params.emitScheduledEvents)) {
                emitScheduledEventForAllPackages(config);
            }

            return runExecutionPlan(config, params);
        }
    };
}
