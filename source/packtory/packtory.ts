import { Result } from 'true-myth';
import type { PacktoryConfig, PacktoryConfigWithoutRegistry } from '../config/config.ts';
import {
    validateConfig,
    validateConfigWithoutRegistry,
    type ValidConfigResult,
    type ConfigWithGraph
} from '../config/validation.ts';
import type { AnalyzedBundle, DeadCodeEliminator } from '../dead-code-eliminator/analyzed-bundle.ts';
import { withFailureCapture } from '../report/decorators.ts';
import { buildChecksResult, type CheckError } from './checks-result.ts';
import { emitEffectiveConfigPerPackage, maybeAttachAggregator } from './report-attachment.ts';
import type { Scheduler as PacktoryScheduler, PartialError } from './scheduler.ts';
import {
    configToBuildAndPublishOptions,
    configToResolveAndLinkOptions,
    type ResolveAndLinkOptions,
    type BuildAndPublishOptions
} from './map-config.ts';
import type {
    BuildAndPublishResult,
    PackageProcessor,
    DetermineVersionAndPublishOptions
} from './package-processor.ts';

type LinkedBundle = Awaited<ReturnType<PackageProcessor['resolveAndLink']>>;
type VersionedBundleWithManifest = BuildAndPublishResult['bundle'];
type ProgressBroadcaster = Parameters<typeof maybeAttachAggregator>[0];

export type BuildAndPublishAllOptions = {
    readonly dryRun: boolean;
    readonly collectReport?: boolean;
};

export type ResolveAndLinkAllOptions = {
    readonly collectReport?: boolean;
};

export type BuildReport = NonNullable<ReturnType<ReturnType<typeof maybeAttachAggregator>['getReport']>>;

export type PublishAllOutcome = {
    readonly result: PublishAllResult;
    readonly getReport: () => BuildReport | undefined;
};

export type ResolveAndLinkAllOutcome = {
    readonly result: ResolveAndLinkAllResult;
    readonly getReport: () => BuildReport | undefined;
};

type ConfigError = {
    type: 'config';
    issues: readonly string[];
};

export type PublishFailure = CheckError | ConfigError | (PartialError<BuildAndPublishResult> & { type: 'partial' });
export type PublishAllResult = Result<readonly BuildAndPublishResult[], PublishFailure>;

export type ResolvedPackage = {
    readonly name: string;
    readonly analyzedBundle: AnalyzedBundle;
    readonly resolveOptions: ResolveAndLinkOptions;
};

type PartialErrorResult = {
    type: 'partial';
    error: PartialError<ResolvedPackage>;
};

export type ResolveAndLinkFailure = CheckError | ConfigError | PartialErrorResult;
export type ResolveAndLinkAllResult = Result<readonly ResolvedPackage[], ResolveAndLinkFailure>;

export type Packtory = {
    buildAndPublishAll: (config: unknown, options: BuildAndPublishAllOptions) => Promise<PublishAllOutcome>;
    resolveAndLinkAll: (config: unknown, options?: ResolveAndLinkAllOptions) => Promise<ResolveAndLinkAllOutcome>;
};

type PacktoryDependencies = {
    readonly packageProcessor: PackageProcessor;
    readonly scheduler: PacktoryScheduler;
    readonly deadCodeEliminator: DeadCodeEliminator;
    readonly progressBroadcaster: ProgressBroadcaster;
};

type InternalResolveAndLinkFailure = CheckError | PartialErrorResult;

function mapResolveFailureToPublishFailure(error: ResolveAndLinkFailure): PublishFailure {
    if (error.type === 'partial') {
        return { type: 'partial', succeeded: [], failures: error.error.failures };
    }
    return error;
}

function mapPublishStageFailure(error: PartialError<BuildAndPublishResult>): PublishFailure {
    return { type: 'partial', ...error };
}

function resolveTransformationsEnabledByName(
    validated: ConfigWithGraph<PacktoryConfigWithoutRegistry>
): ReadonlyMap<string, boolean> {
    const commonEnabled = validated.packtoryConfig.commonPackageSettings?.deadCodeElimination?.enabled;
    return new Map(
        validated.packtoryConfig.packages.map((packageConfig) => {
            const packageEnabled = packageConfig.deadCodeElimination?.enabled;
            return [packageConfig.name, packageEnabled ?? commonEnabled ?? true];
        })
    );
}

export function createPacktory(dependencies: PacktoryDependencies): Packtory {
    const { packageProcessor, scheduler, deadCodeEliminator, progressBroadcaster } = dependencies;

    function createResolveOptions(
        packageName: string,
        existing: readonly LinkedBundle[],
        config: ConfigWithGraph<PacktoryConfigWithoutRegistry>
    ): ResolveAndLinkOptions {
        return configToResolveAndLinkOptions(packageName, config.packageConfigs, config.packtoryConfig, existing);
    }

    async function resolveAndLinkAllValidated(
        config: ConfigWithGraph<PacktoryConfigWithoutRegistry>
    ): Promise<Result<readonly ResolvedPackage[], InternalResolveAndLinkFailure>> {
        type LinkedPackage = {
            readonly name: string;
            readonly linkedBundle: LinkedBundle;
            readonly resolveOptions: ResolveAndLinkOptions;
        };

        const runResult = await scheduler.runForEachScheduledPackage<
            LinkedPackage,
            LinkedBundle,
            ResolveAndLinkOptions,
            PacktoryConfigWithoutRegistry
        >({
            config,
            createOptions: (context) => {
                const options = createResolveOptions(context.packageName, context.existing, context.config);
                if (progressBroadcaster.provider.hasSubscribers('inputsResolved')) {
                    progressBroadcaster.provider.emit('inputsResolved', {
                        packageName: options.name,
                        entryPoints: options.entryPoints.map((entry) => {
                            return entry.js;
                        }),
                        sourceFileCount: 0,
                        siblingVersions: {}
                    });
                }
                return options;
            },
            execute: withFailureCapture(progressBroadcaster.provider, 'resolveAndLink', async (resolveOptions) => {
                const linkedBundle = await packageProcessor.resolveAndLink(resolveOptions);
                return {
                    name: resolveOptions.name,
                    linkedBundle,
                    resolveOptions
                } satisfies LinkedPackage;
            }),
            selectNext: (params) => {
                const { result } = params;
                return result.linkedBundle;
            },
            emitScheduledEvents: true
        });

        if (runResult.isErr) {
            return Result.err({
                type: 'partial',
                error: { succeeded: [], failures: runResult.error.failures }
            });
        }

        const linkedPackages = runResult.value;
        const transformationsEnabledByName = resolveTransformationsEnabledByName(config);
        const analyzedBundles = await deadCodeEliminator.eliminate(
            linkedPackages.map((linkedPackage) => {
                const transformationsEnabled = transformationsEnabledByName.get(linkedPackage.name);
                if (transformationsEnabled === undefined) {
                    throw new Error(`Missing transformations flag for package "${linkedPackage.name}"`);
                }
                return { bundle: linkedPackage.linkedBundle, transformationsEnabled };
            })
        );
        const resolvedPackages: readonly ResolvedPackage[] = linkedPackages.map((linkedPackage, index) => {
            const analyzedBundle = analyzedBundles[index];
            if (analyzedBundle === undefined) {
                throw new Error(`Analyzed bundle missing for package "${linkedPackage.name}"`);
            }
            return {
                name: linkedPackage.name,
                analyzedBundle,
                resolveOptions: linkedPackage.resolveOptions
            };
        });

        return buildChecksResult(config, resolvedPackages);
    }

    async function determineVersionAndPublishAll(
        config: ValidConfigResult,
        resolvedPackages: readonly ResolvedPackage[],
        options: BuildAndPublishAllOptions
    ): Promise<Result<readonly BuildAndPublishResult[], PartialError<BuildAndPublishResult>>> {
        const analyzedBundlesByName: Readonly<Record<string, AnalyzedBundle>> = Object.fromEntries(
            resolvedPackages.map((resolvedPackage) => {
                return [resolvedPackage.name, resolvedPackage.analyzedBundle];
            })
        );

        return scheduler.runForEachScheduledPackage<
            BuildAndPublishResult,
            VersionedBundleWithManifest,
            BuildAndPublishOptions,
            PacktoryConfig
        >({
            config,
            createOptions: (context) => {
                const { packageName, existing, config: validatedConfig } = context;
                return configToBuildAndPublishOptions(
                    packageName,
                    validatedConfig.packageConfigs,
                    validatedConfig.packtoryConfig,
                    existing
                );
            },
            execute: withFailureCapture(progressBroadcaster.provider, 'publish', async (buildOptions) => {
                const analyzedBundle = analyzedBundlesByName[buildOptions.name];
                if (analyzedBundle === undefined) {
                    throw new Error(`Analyzed bundle for package "${buildOptions.name}" is missing`);
                }

                const processorOptions: DetermineVersionAndPublishOptions = {
                    analyzedBundle,
                    buildOptions
                };

                if (options.dryRun) {
                    return packageProcessor.tryBuildAndPublish(processorOptions);
                }
                return packageProcessor.buildAndPublish(processorOptions);
            }),
            selectNext: (params) => {
                return params.result.bundle;
            },
            emitScheduledEvents: false,
            createProgressEvent: (params) => {
                const { result } = params;
                return {
                    version: result.bundle.packageJson.version,
                    status: result.status
                };
            }
        });
    }

    async function resolveAndLinkAllPublic(
        config: unknown,
        options?: ResolveAndLinkAllOptions
    ): Promise<ResolveAndLinkAllOutcome> {
        const reporting = maybeAttachAggregator(progressBroadcaster, options?.collectReport);
        try {
            const validation = validateConfigWithoutRegistry(config);
            if (validation.isErr) {
                return {
                    result: Result.err({ type: 'config', issues: validation.error }),
                    getReport: reporting.getReport
                };
            }

            const result = await resolveAndLinkAllValidated(validation.value);
            if (result.isErr) {
                return { result: Result.err(result.error), getReport: reporting.getReport };
            }
            return { result: Result.ok(result.value), getReport: reporting.getReport };
        } finally {
            reporting.dispose();
        }
    }

    async function runBuildAndPublishValidated(
        validated: ValidConfigResult,
        options: BuildAndPublishAllOptions
    ): Promise<PublishAllResult> {
        emitEffectiveConfigPerPackage(progressBroadcaster, validated.packtoryConfig);

        const resolvedBundlesResult = await resolveAndLinkAllValidated(validated);
        if (resolvedBundlesResult.isErr) {
            return Result.err(mapResolveFailureToPublishFailure(resolvedBundlesResult.error));
        }

        const publishResult = await determineVersionAndPublishAll(validated, resolvedBundlesResult.value, options);
        if (publishResult.isErr) {
            return Result.err(mapPublishStageFailure(publishResult.error));
        }
        return Result.ok(publishResult.value);
    }

    async function runBuildAndPublish(config: unknown, options: BuildAndPublishAllOptions): Promise<PublishAllResult> {
        const validation = validateConfig(config);
        if (validation.isErr) {
            return Result.err({ type: 'config', issues: validation.error });
        }
        return runBuildAndPublishValidated(validation.value, options);
    }

    async function buildAndPublishAllPublic(
        config: unknown,
        options: BuildAndPublishAllOptions
    ): Promise<PublishAllOutcome> {
        const reporting = maybeAttachAggregator(progressBroadcaster, options.collectReport);
        try {
            const result = await runBuildAndPublish(config, options);
            return { result, getReport: reporting.getReport };
        } finally {
            reporting.dispose();
        }
    }

    return {
        buildAndPublishAll: buildAndPublishAllPublic,
        resolveAndLinkAll: resolveAndLinkAllPublic
    };
}
