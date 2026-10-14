import { Result } from 'true-myth';
import type { PacktoryConfiguration } from '../../configuration/configuration.ts';
import type { ConfigurationWithGraph, ValidConfigurationResult } from '../../configuration/validation.ts';
import { collectPublicModuleUsage } from '../../package-surface/public-module-usage.ts';
import { withFailureCapture } from '../../report/decorators.ts';
import {
    configurationToBuildAndPublishOptions,
    type BuildAndPublishOptions,
    type VersionSourceResolver
} from '../map-configuration.ts';
import type { PackageProcessor } from '../package-processor.ts';
import type { BuildAndPublishAllOptions, ProgressBroadcaster } from '../packtory-results.ts';
import type { ResolvedPackage } from '../resolved-package.ts';
import type { PartialError, Scheduler as PacktoryScheduler } from '../scheduler.ts';

type BuildAndPublishResult = Awaited<ReturnType<PackageProcessor['tryBuildAndPublish']>>;
type DetermineVersionAndPublishOptions = Parameters<PackageProcessor['tryBuildAndPublish']>[0];
type VersionedBundleWithManifest = BuildAndPublishResult['bundle'];
type PreparedPublish = {
    readonly buildOptions: BuildAndPublishOptions;
    readonly result: BuildAndPublishResult;
};
type BuildOptionsContext = {
    readonly packageName: string;
    readonly existing: readonly VersionedBundleWithManifest[];
    readonly configuration: ConfigurationWithGraph<PacktoryConfiguration>;
};
type BuildOptionsFactory = (context: BuildOptionsContext) => BuildAndPublishOptions;
type ProgressEventSource = {
    readonly result: BuildAndPublishResult;
};
type PublishProgressEvent = {
    readonly version: string;
    readonly status: BuildAndPublishResult['status'];
    readonly publication: BuildAndPublishResult['publication'];
};
type PreparedProgressEventSource = {
    readonly result: PreparedPublish;
};
type PreparePublishesInput = {
    readonly dependencies: PublishStageDependencies;
    readonly configuration: ValidConfigurationResult;
    readonly publishStageInputs: PublishStageInputs;
    readonly stage: boolean;
    readonly emitDoneEvents: boolean;
};
type PublishPreparedResultsInput = {
    readonly dependencies: PublishStageDependencies;
    readonly configuration: ValidConfigurationResult;
    readonly publishStageInputs: PublishStageInputs;
    readonly preparedPublishes: readonly PreparedPublish[];
    readonly stage: boolean;
};

export type PublishStageDependencies = {
    readonly packageProcessor: PackageProcessor;
    readonly scheduler: PacktoryScheduler;
    readonly progressBroadcaster: ProgressBroadcaster;
    readonly repositoryFolder: string;
    readonly resolveVersionSource?: VersionSourceResolver | undefined;
};

export type PublishStageResult = Result<readonly BuildAndPublishResult[], PartialError<BuildAndPublishResult>>;

type PublishStageInputs = {
    readonly analyzedBundles: readonly ResolvedPackage['analyzedBundle'][];
    readonly analyzedBundlesByName: Readonly<Record<string, ResolvedPackage['analyzedBundle']>>;
};

function collectPublishStageInputs(resolvedPackages: readonly ResolvedPackage[]): PublishStageInputs {
    const analyzedBundles: ResolvedPackage['analyzedBundle'][] = [];
    const analyzedBundlesByName: Record<string, ResolvedPackage['analyzedBundle']> = {};

    for (const resolvedPackage of resolvedPackages) {
        analyzedBundles.push(resolvedPackage.analyzedBundle);
        analyzedBundlesByName[resolvedPackage.name] = resolvedPackage.analyzedBundle;
    }

    return { analyzedBundles, analyzedBundlesByName };
}

function createBuildOptionsFactory(
    dependencies: PublishStageDependencies
): BuildOptionsFactory {
    return function (context) {
        const { packageName, existing, configuration: validatedConfiguration } = context;
        return configurationToBuildAndPublishOptions(
            packageName,
            validatedConfiguration.packageConfigurations,
            validatedConfiguration.packtoryConfiguration,
            {
                existingBundles: existing,
                repositoryFolder: dependencies.repositoryFolder,
                resolveVersionSource: dependencies.resolveVersionSource
            }
        );
    };
}

function createProcessorOptions(
    analyzedBundlesByName: PublishStageInputs['analyzedBundlesByName'],
    publicModuleUsageByName: ReadonlyMap<string, ReadonlySet<string>>,
    buildOptions: BuildAndPublishOptions,
    stage: boolean
): DetermineVersionAndPublishOptions {
    const analyzedBundle = analyzedBundlesByName[buildOptions.name];
    if (analyzedBundle === undefined) {
        throw new Error(`Analyzed bundle for package "${buildOptions.name}" is missing`);
    }

    return {
        analyzedBundle,
        buildOptions,
        stage,
        substitutionPublicModuleSourcePaths: publicModuleUsageByName.get(buildOptions.name)
    };
}

function progressEvent(input: ProgressEventSource): PublishProgressEvent {
    return {
        version: input.result.bundle.packageManifest.version,
        status: input.result.status,
        publication: input.result.publication
    };
}

function preparedProgressEvent(input: PreparedProgressEventSource): PublishProgressEvent {
    return progressEvent({ result: input.result.result });
}

async function preparePublishes(
    input: PreparePublishesInput
): Promise<Result<readonly PreparedPublish[], PartialError<PreparedPublish>>> {
    const { dependencies, configuration, publishStageInputs, stage, emitDoneEvents } = input;
    const publicModuleUsageByName = collectPublicModuleUsage(publishStageInputs.analyzedBundles);
    return dependencies.scheduler.runForEachScheduledPackage<
        PreparedPublish,
        VersionedBundleWithManifest,
        BuildAndPublishOptions,
        PacktoryConfiguration
    >({
        configuration,
        createOptions: createBuildOptionsFactory(dependencies),
        execute: withFailureCapture(
            dependencies.progressBroadcaster.provider,
            'publish',
            async function (buildOptions) {
                const processorOptions = createProcessorOptions(
                    publishStageInputs.analyzedBundlesByName,
                    publicModuleUsageByName,
                    buildOptions,
                    stage
                );
                const result = await dependencies.packageProcessor.tryBuildAndPublish(processorOptions);
                return { buildOptions, result };
            }
        ),
        selectNext(scheduledPackage) {
            return scheduledPackage.result.result.bundle;
        },
        emitScheduledEvents: false,
        createProgressEvent: emitDoneEvents ? preparedProgressEvent : undefined
    });
}

function publishResultFromPreparationDryRun(
    result: Extract<Awaited<ReturnType<typeof preparePublishes>>, { readonly isErr: true; }>
): PublishStageResult {
    return Result.err({
        succeeded: result.error.succeeded.map(function (input) {
            return input.result;
        }),
        failures: result.error.failures
    });
}

function publishResultFromPreparationFailure(
    result: Extract<Awaited<ReturnType<typeof preparePublishes>>, { readonly isErr: true; }>
): PublishStageResult {
    return Result.err({ succeeded: [], failures: result.error.failures });
}

async function publishPreparedResults(
    input: PublishPreparedResultsInput
): Promise<PublishStageResult> {
    const { dependencies, configuration, publishStageInputs, preparedPublishes, stage } = input;
    const publicModuleUsageByName = collectPublicModuleUsage(publishStageInputs.analyzedBundles);
    const preparedPublishByName = new Map(
        preparedPublishes.map(function (preparedPublish) {
            return [ preparedPublish.result.bundle.name, preparedPublish ] as const;
        })
    );

    return dependencies.scheduler.runForEachScheduledPackage<
        BuildAndPublishResult,
        VersionedBundleWithManifest,
        BuildAndPublishOptions,
        PacktoryConfiguration
    >({
        configuration,
        createOptions: createBuildOptionsFactory(dependencies),
        execute: withFailureCapture(
            dependencies.progressBroadcaster.provider,
            'publish',
            async function (buildOptions) {
                const preparedPublish = preparedPublishByName.get(buildOptions.name);
                if (preparedPublish === undefined) {
                    throw new Error(`Prepared publish for package "${buildOptions.name}" is missing`);
                }
                const processorOptions = createProcessorOptions(
                    publishStageInputs.analyzedBundlesByName,
                    publicModuleUsageByName,
                    buildOptions,
                    stage
                );
                return dependencies.packageProcessor.publishPreparedPackage(processorOptions, preparedPublish.result);
            }
        ),
        selectNext(scheduledPackage) {
            return scheduledPackage.result.bundle;
        },
        emitScheduledEvents: false,
        createProgressEvent: progressEvent
    });
}

export async function determineVersionAndPublishAll(
    dependencies: PublishStageDependencies,
    configuration: ValidConfigurationResult,
    resolvedPackages: readonly ResolvedPackage[],
    options: BuildAndPublishAllOptions
): Promise<PublishStageResult> {
    const publishStageInputs = collectPublishStageInputs(resolvedPackages);
    const prepared = await preparePublishes({
        dependencies,
        configuration,
        publishStageInputs,
        stage: options.stage,
        emitDoneEvents: options.dryRun
    });
    if (prepared.isErr) {
        return options.dryRun
            ? publishResultFromPreparationDryRun(prepared)
            : publishResultFromPreparationFailure(prepared);
    }
    if (options.dryRun) {
        return Result.ok(prepared.value.map(function (input) {
            return input.result;
        }));
    }
    return publishPreparedResults({
        dependencies,
        configuration,
        publishStageInputs,
        preparedPublishes: prepared.value,
        stage: options.stage
    });
}
