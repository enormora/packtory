import { Result } from 'true-myth';
import { mapToObj } from 'remeda';
import type { PacktoryConfig, PacktoryConfigWithoutRegistry } from '../config/config.ts';
import {
    validateConfig,
    validateConfigWithoutRegistry,
    type ValidConfigResult,
    type ConfigWithGraph
} from '../config/validation.ts';
import type { AnalyzedBundle, DeadCodeEliminator } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import { runChecks } from '../checks/check-runner.ts';
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

type Options = {
    readonly dryRun: boolean;
};

type ConfigError = {
    type: 'config';
    issues: readonly string[];
};

type CheckError = {
    type: 'checks';
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
    buildAndPublishAll: (config: unknown, options: Options) => Promise<PublishAllResult>;
    resolveAndLinkAll: (config: unknown) => Promise<ResolveAndLinkAllResult>;
};

type PacktoryDependencies = {
    readonly packageProcessor: PackageProcessor;
    readonly scheduler: PacktoryScheduler;
    readonly deadCodeEliminator: DeadCodeEliminator;
};

type InternalResolveAndLinkFailure = CheckError | PartialErrorResult;

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
    const { packageProcessor, scheduler, deadCodeEliminator } = dependencies;

    function createResolveOptions(
        packageName: string,
        existing: readonly LinkedBundle[],
        config: ConfigWithGraph<PacktoryConfigWithoutRegistry>
    ): ResolveAndLinkOptions {
        return configToResolveAndLinkOptions(packageName, config.packageConfigs, config.packtoryConfig, existing);
    }

    function buildChecksResult(
        validated: ConfigWithGraph<PacktoryConfigWithoutRegistry>,
        resolvedPackages: readonly ResolvedPackage[]
    ): Result<readonly ResolvedPackage[], CheckError> {
        const { packtoryConfig: config } = validated;
        const perPackageSettings = new Map(
            config.packages.map((packageConfig) => {
                return [packageConfig.name, packageConfig.checks];
            })
        );
        const commonMainPackageJson = config.commonPackageSettings?.mainPackageJson;
        const effectivePackageConfigs = mapToObj(config.packages, (packageConfig) => {
            return [
                packageConfig.name,
                {
                    ...packageConfig,
                    mainPackageJson: packageConfig.mainPackageJson ?? commonMainPackageJson
                }
            ];
        });
        const checkIssues = runChecks({
            settings: config.checks ?? {},
            perPackageSettings,
            packageConfigs: effectivePackageConfigs,
            bundles: resolvedPackages.map((resolvedPackage) => {
                return resolvedPackage.analyzedBundle;
            })
        });

        if (checkIssues.length > 0) {
            return Result.err({ type: 'checks', issues: checkIssues });
        }

        return Result.ok(resolvedPackages);
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
                return createResolveOptions(context.packageName, context.existing, context.config);
            },
            execute: async (resolveOptions) => {
                const linkedBundle = await packageProcessor.resolveAndLink(resolveOptions);
                return {
                    name: resolveOptions.name,
                    linkedBundle,
                    resolveOptions
                } satisfies LinkedPackage;
            },
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
        options: Options
    ): Promise<Result<readonly BuildAndPublishResult[], PartialError<BuildAndPublishResult>>> {
        const analyzedBundlesByName: Readonly<Record<string, AnalyzedBundle>> = mapToObj(
            resolvedPackages,
            (resolvedPackage) => {
                return [resolvedPackage.name, resolvedPackage.analyzedBundle];
            }
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
            execute: async (buildOptions) => {
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
            },
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

    function mapResolveFailureToPublishFailure(error: ResolveAndLinkFailure): PublishFailure {
        if (error.type === 'partial') {
            return {
                type: 'partial',
                succeeded: [],
                failures: error.error.failures
            };
        }

        return error;
    }

    function mapPublishStageFailure(error: PartialError<BuildAndPublishResult>): PublishFailure {
        return {
            type: 'partial',
            ...error
        };
    }

    async function resolveAndLinkAllPublic(config: unknown): Promise<ResolveAndLinkAllResult> {
        const validation = validateConfigWithoutRegistry(config);
        if (validation.isErr) {
            return Result.err({ type: 'config', issues: validation.error });
        }

        const result = await resolveAndLinkAllValidated(validation.value);
        if (result.isErr) {
            return Result.err(result.error);
        }
        return Result.ok(result.value);
    }

    async function buildAndPublishAllPublic(config: unknown, options: Options): Promise<PublishAllResult> {
        const validation = validateConfig(config);
        if (validation.isErr) {
            return Result.err({
                type: 'config',
                issues: validation.error
            });
        }

        const resolvedBundlesResult = await resolveAndLinkAllValidated(validation.value);
        if (resolvedBundlesResult.isErr) {
            return Result.err(mapResolveFailureToPublishFailure(resolvedBundlesResult.error));
        }

        const publishResult = await determineVersionAndPublishAll(
            validation.value,
            resolvedBundlesResult.value,
            options
        );

        if (publishResult.isErr) {
            return Result.err(mapPublishStageFailure(publishResult.error));
        }

        return Result.ok(publishResult.value);
    }

    return {
        buildAndPublishAll: buildAndPublishAllPublic,
        resolveAndLinkAll: resolveAndLinkAllPublic
    };
}
