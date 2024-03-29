import { partition } from 'effect/ReadonlyArray';
import { get } from 'effect/Struct';
import { Result } from 'true-myth';
import type { BundleDescription } from '../bundler/bundle-description.js';
import type { ValidConfigResult } from '../config/validation.js';
import type { BuildAndPublishOptions, PublishResult } from '../publisher/publisher.js';
import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.js';
import { configToBuildAndPublishOptions } from './map-config.js';

type PackageOperationCallback = (options: BuildAndPublishOptions) => Promise<PublishResult>;

export type PartialError = {
    readonly succeeded: readonly PublishResult[];
    readonly failures: readonly Error[];
};

export type Scheduler = {
    runForEachScheduledPackage(
        config: ValidConfigResult,
        callback: PackageOperationCallback
    ): Promise<Result<readonly PublishResult[], PartialError>>;
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
const getBundle = get('bundle');
const getReason = get('reason');

export function createScheduler(dependencies: SchedulerDependencies): Scheduler {
    const { progressBroadcastProvider } = dependencies;

    async function runForGeneration(
        packageNames: readonly string[],
        config: ValidConfigResult,
        existingBundles: readonly BundleDescription[],
        callback: PackageOperationCallback
    ): Promise<Result<readonly PublishResult[], PartialError>> {
        const { packageConfigs, packtoryConfig } = config;
        const results = await Promise.allSettled(
            packageNames.map(async (packageName) => {
                try {
                    const options = configToBuildAndPublishOptions(
                        packageName,
                        packageConfigs,
                        packtoryConfig,
                        existingBundles
                    );
                    const result = await callback(options);
                    progressBroadcastProvider.emit('done', {
                        packageName,
                        version: result.bundle.packageJson.version,
                        status: result.status
                    });
                    return result;
                } catch (error: unknown) {
                    if (error instanceof Error) {
                        progressBroadcastProvider.emit('error', { packageName, error });
                    } else {
                        progressBroadcastProvider.emit('error', { packageName, error: new Error('Unknown error') });
                    }
                    throw error;
                }
            })
        );
        const [rejectedResults, fulfilledResults] = partition(results, isFulfilledResult);
        const succeeded = fulfilledResults.map(getValue);

        if (rejectedResults.length > 0) {
            return Result.err({
                succeeded,
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
        return config.packageGraph.reverse().getTopologicalGenerations();
    }

    return {
        async runForEachScheduledPackage(config, callback) {
            emitScheduledEventForAllPackages(config);

            const bundles: BundleDescription[] = [];
            const succeeded: PublishResult[] = [];

            for (const generation of getExecutionPlan(config)) {
                const generationResult = await runForGeneration(generation, config, bundles, callback);
                if (generationResult.isErr) {
                    return Result.err({
                        succeeded: [...succeeded, ...generationResult.error.succeeded],
                        failures: generationResult.error.failures
                    });
                }

                bundles.push(...generationResult.value.map(getBundle));
                succeeded.push(...generationResult.value);
            }

            return Result.ok(succeeded);
        }
    };
}
