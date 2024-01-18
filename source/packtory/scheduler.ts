import { partition } from 'effect/ReadonlyArray';
import { isSubrecord } from 'effect/ReadonlyRecord';
import { get } from 'effect/Struct';
import { Result } from 'true-myth';
import type { BundleDescription } from '../bundler/bundle-description.js';
import type { PackageConfig, PacktoryConfig } from '../config/config.js';
import type { MainPackageJson } from '../config/package-json.js';
import type { ValidConfigResult } from '../config/validation.js';
import type { BuildAndPublishOptions, PublishResult } from '../publisher/publisher.js';
import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.js';

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

function dependencyNamesToBundles(
    dependencyNames: readonly string[],
    bundles: readonly BundleDescription[]
): readonly BundleDescription[] {
    return dependencyNames.map((dependencyName) => {
        const matchName = isSubrecord<unknown>({ name: dependencyName });
        const bundle = bundles.find(matchName);
        if (bundle === undefined) {
            throw new Error(`Dependent bundle "${dependencyName}" not found`);
        }
        return bundle;
    });
}

function configToBuildAndPublishOptions(
    packageName: string,
    packageConfigs: Map<string, PackageConfig>,
    packtoryConfig: PacktoryConfig,
    existingBundles: readonly BundleDescription[]
): BuildAndPublishOptions {
    const packageConfig = packageConfigs.get(packageName);
    if (packageConfig === undefined) {
        throw new Error(`Config for package "${packageName}" is missing`);
    }

    const {
        sourcesFolder: sourcesFolderFromPackageConfig,
        mainPackageJson: mainPackageJsonFromPackageConfig,
        bundleDependencies = [],
        bundlePeerDependencies = [],
        ...remainingPackageConfig
    } = packageConfig;
    const mainPackageJson = (packtoryConfig.commonPackageSettings?.mainPackageJson ??
        mainPackageJsonFromPackageConfig) as MainPackageJson;
    const sourcesFolder = (packtoryConfig.commonPackageSettings?.sourcesFolder ??
        sourcesFolderFromPackageConfig) as string;

    return {
        ...remainingPackageConfig,
        registrySettings: packtoryConfig.registrySettings,
        mainPackageJson,
        sourcesFolder,
        bundleDependencies: dependencyNamesToBundles(bundleDependencies, existingBundles),
        bundlePeerDependencies: dependencyNamesToBundles(bundlePeerDependencies, existingBundles)
    };
}

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
        packageConfigs: Map<string, PackageConfig>,
        packtoryConfig: PacktoryConfig,
        existingBundles: readonly BundleDescription[],
        callback: PackageOperationCallback
    ): Promise<Result<readonly PublishResult[], PartialError>> {
        const results = await Promise.allSettled(
            packageNames.map(async (packageName) => {
                const options = configToBuildAndPublishOptions(
                    packageName,
                    packageConfigs,
                    packtoryConfig,
                    existingBundles
                );

                try {
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

    return {
        async runForEachScheduledPackage(config, callback) {
            const { packageGraph, packageConfigs, packtoryConfig } = config;

            for (const packageConfig of packtoryConfig.packages) {
                progressBroadcastProvider.emit('scheduled', { packageName: packageConfig.name });
            }

            const executionPlan = packageGraph.getTopologicalGenerations();
            const bundles: BundleDescription[] = [];
            const succeeded: PublishResult[] = [];

            for (const generation of executionPlan) {
                const generationResult = await runForGeneration(
                    generation,
                    packageConfigs,
                    packtoryConfig,
                    bundles,
                    callback
                );
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
