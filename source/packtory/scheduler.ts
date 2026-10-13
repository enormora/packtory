import { Result } from 'true-myth';
import type { PublicationOutcome } from '../bundle-emitter/publication-outcome.ts';
import type { ConfigurationWithGraph } from '../configuration/validation.ts';
import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.ts';
import type { PackageConfiguration } from '../configuration/configuration.ts';
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
        TConfiguration extends { readonly packages: readonly PackageConfiguration[]; }
    >(
        input: RunForEachScheduledPackageInput<TResult, TNext, TOptions, TConfiguration>
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
    const succeeded: PackageSuccess<TResult, TOptions>[] = [];
    const succeededResults: TResult[] = [];
    const failures: Error[] = [];

    for (const result of results) {
        if (result.status === 'fulfilled') {
            succeeded.push(result.value);
            succeededResults.push(result.value.result);
        } else {
            failures.push(toError(result.reason));
        }
    }

    return { succeeded, succeededResults, failures };
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

type PackageExecutionContext<TNext, TConfiguration extends { readonly packages: readonly PackageConfiguration[]; }> = {
    readonly packageName: string;
    readonly existing: readonly TNext[];
    readonly configuration: ConfigurationWithGraph<TConfiguration>;
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
    input: ProgressEventInput<TResult, TOptions>
) => ProgressEventReturnValue;

type RunForEachScheduledPackageInput<
    TResult,
    TNext,
    TOptions,
    TConfiguration extends { readonly packages: readonly PackageConfiguration[]; }
> = {
    readonly configuration: ConfigurationWithGraph<TConfiguration>;
    readonly createOptions: (context: PackageExecutionContext<TNext, TConfiguration>) => TOptions;
    readonly execute: (options: TOptions) => Promise<TResult>;
    readonly selectNext: (input: SelectNextInput<TResult, TOptions>) => TNext;
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
        TConfiguration extends { readonly packages: readonly PackageConfiguration[]; }
    >(
        packageNames: readonly string[],
        configuration: ConfigurationWithGraph<TConfiguration>,
        existingItems: readonly TNext[],
        input: RunForEachScheduledPackageInput<TResult, TNext, TOptions, TConfiguration>
    ): Promise<Result<readonly PackageSuccess<TResult, TOptions>[], PartialError<TResult>>> {
        const executePackage = async function (packageName: string): Promise<PackageSuccess<TResult, TOptions>> {
            const options = input.createOptions({ packageName, existing: existingItems, configuration });
            const result = await executeAndReportError(packageName, options, input.execute);
            const progressEvent = input.createProgressEvent?.({ packageName, result, options });
            if (progressEvent !== undefined) {
                progressBroadcastProvider.emit('done', { packageName, ...progressEvent });
            }
            return { packageName, result, options };
        };

        const results = await Promise.allSettled(packageNames.map(executePackage));
        return summarizeGenerationResults(results);
    }

    function emitScheduledEventForAllPackages<
        TConfiguration extends { readonly packages: readonly PackageConfiguration[]; }
    >(
        configuration: ConfigurationWithGraph<TConfiguration>
    ): void {
        for (const packageConfiguration of configuration.packtoryConfiguration.packages) {
            progressBroadcastProvider.emit('scheduled', { packageName: packageConfiguration.name });
        }
    }

    function getExecutionPlan<TConfiguration extends { readonly packages: readonly PackageConfiguration[]; }>(
        configuration: ConfigurationWithGraph<TConfiguration>
    ): readonly (readonly string[])[] {
        const reverseGraph = configuration.packageGraph.reverse.bind(configuration.packageGraph);
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
        selectNext: (input: SelectNextInput<TResult, TOptions>) => TNext
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
        TConfiguration extends { readonly packages: readonly PackageConfiguration[]; }
    >(
        configuration: ConfigurationWithGraph<TConfiguration>,
        input: RunForEachScheduledPackageInput<TResult, TNext, TOptions, TConfiguration>
    ): Promise<Result<readonly TResult[], PartialError<TResult>>> {
        const nextItems: TNext[] = [];
        const succeededResults: TResult[] = [];

        for (const generation of getExecutionPlan(configuration)) {
            const generationResult = await runForGeneration(generation, configuration, nextItems, input);
            if (generationResult.isErr) {
                return failGeneration(succeededResults, generationResult.error);
            }

            appendGenerationSuccesses(nextItems, succeededResults, generationResult.value, input.selectNext);
        }

        return Result.ok(succeededResults);
    }

    return {
        async runForEachScheduledPackage<
            TResult,
            TNext,
            TOptions,
            TConfiguration extends { readonly packages: readonly PackageConfiguration[]; }
        >(input: RunForEachScheduledPackageInput<TResult, TNext, TOptions, TConfiguration>) {
            const { configuration } = input;
            if (shouldEmitScheduledEvents(input.emitScheduledEvents)) {
                emitScheduledEventForAllPackages(configuration);
            }

            return runExecutionPlan(configuration, input);
        }
    };
}
