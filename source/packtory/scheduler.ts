import { partition } from 'effect/ReadonlyArray';
import { get } from 'effect/Struct';
import { Result } from 'true-myth';
import type { ValidConfigResult } from '../config/validation.ts';
import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.ts';

export type PartialError<TResult> = {
    readonly succeeded: readonly TResult[];
    readonly failures: readonly Error[];
};

export type Scheduler = {
    runForEachScheduledPackage: <TResult, TNext, TOptions>(
        params: RunForEachScheduledPackageParams<TResult, TNext, TOptions>
    ) => Promise<Result<readonly TResult[], PartialError<TResult>>>;
};

type SchedulerDependencies = {
    readonly progressBroadcastProvider: ProgressBroadcastProvider;
};

function isFulfilledResult<T extends PromiseSettledResult<unknown>>(
    result: T
): result is Extract<T, { status: 'fulfilled' }> {
    return result.status === 'fulfilled';
}

const getValue = get('value');
const getReason = get('reason');

type PackageExecutionContext<TNext> = {
    readonly packageName: string;
    readonly existing: readonly TNext[];
    readonly config: ValidConfigResult;
};

type PackageSuccess<TResult, TOptions> = {
    readonly packageName: string;
    readonly options: TOptions;
    readonly result: TResult;
};

type ProgressEventReturnValue = {
    version: string;
    status: 'already-published' | 'initial-version' | 'new-version';
};

type SchedulerState<TResult, TNext> = {
    readonly nextItems: TNext[];
    readonly succeeded: TResult[];
};

type RunForEachScheduledPackageParams<TResult, TNext, TOptions> = {
    readonly config: ValidConfigResult;
    readonly createOptions: (context: PackageExecutionContext<TNext>) => TOptions;
    readonly execute: (options: TOptions) => Promise<TResult>;
    readonly selectNext: (params: { result: TResult; options: TOptions }) => TNext;
    readonly createProgressEvent?:
        | ((params: { packageName: string; result: TResult; options: TOptions }) => ProgressEventReturnValue)
        | undefined;
};

export function createScheduler(dependencies: SchedulerDependencies): Scheduler {
    const { progressBroadcastProvider } = dependencies;

    async function runForGeneration<TResult, TNext, TOptions>(
        packageNames: readonly string[],
        config: ValidConfigResult,
        existingItems: readonly TNext[],
        params: RunForEachScheduledPackageParams<TResult, TNext, TOptions>
    ): Promise<Result<readonly PackageSuccess<TResult, TOptions>[], PartialError<TResult>>> {
        const buildPackageSuccess = async (packageName: string): Promise<PackageSuccess<TResult, TOptions>> => {
            const options = params.createOptions({ packageName, existing: existingItems, config });
            const result = await params.execute(options);
            const progressEvent = params.createProgressEvent?.({ packageName, result, options });
            if (progressEvent !== undefined) {
                progressBroadcastProvider.emit('done', { packageName, ...progressEvent });
            }
            return { packageName, result, options } satisfies PackageSuccess<TResult, TOptions>;
        };

        const executePackage = async (packageName: string): Promise<PackageSuccess<TResult, TOptions>> => {
            try {
                return await buildPackageSuccess(packageName);
            } catch (error: unknown) {
                if (error instanceof Error) {
                    progressBroadcastProvider.emit('error', { packageName, error });
                } else {
                    progressBroadcastProvider.emit('error', { packageName, error: new Error('Unknown error') });
                }
                throw error;
            }
        };

        const results = await Promise.allSettled(packageNames.map(executePackage));
        const [rejectedResults, fulfilledResults] = partition(results, isFulfilledResult);
        const succeeded = fulfilledResults.map(getValue);

        if (rejectedResults.length > 0) {
            return Result.err({
                succeeded: succeeded.map((entry) => {
                    return entry.result;
                }),
                failures: rejectedResults.map(getReason)
            });
        }

        return Result.ok(succeeded);
    }

    function emitScheduledEventForAllPackages(config: ValidConfigResult): void {
        for (const packageConfig of config.packtoryConfig.packages) {
            progressBroadcastProvider.emit('scheduled', { packageName: packageConfig.name });
        }
    }

    function getExecutionPlan(config: ValidConfigResult): readonly (readonly string[])[] {
        // eslint-disable-next-line unicorn/no-array-reverse -- false positive
        return config.packageGraph.reverse().getTopologicalGenerations();
    }

    return {
        async runForEachScheduledPackage<TResult, TNext, TOptions>(
            params: RunForEachScheduledPackageParams<TResult, TNext, TOptions>
        ) {
            const { config } = params;
            emitScheduledEventForAllPackages(config);

            const state: SchedulerState<TResult, TNext> = { nextItems: [], succeeded: [] };

            const processGeneration = async (
                generation: readonly string[]
            ): Promise<Result<undefined, PartialError<TResult>>> => {
                const generationResult = await runForGeneration(generation, config, state.nextItems, params);
                if (generationResult.isErr) {
                    return Result.err({
                        succeeded: [...state.succeeded, ...generationResult.error.succeeded],
                        failures: generationResult.error.failures
                    });
                }

                generationResult.value.forEach((entry) => {
                    state.nextItems.push(params.selectNext({ result: entry.result, options: entry.options }));
                    state.succeeded.push(entry.result);
                });

                return Result.ok(undefined);
            };

            for (const generation of getExecutionPlan(config)) {
                const iterationResult = await processGeneration(generation);
                if (iterationResult.isErr) {
                    return Result.err(iterationResult.error);
                }
            }

            return Result.ok(state.succeeded);
        }
    };
}
