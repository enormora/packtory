import { Result } from 'true-myth';
import type { PacktoryConfig, PacktoryConfigWithoutRegistry, PackageConfig } from '../config/config.ts';
import {
    validateConfig,
    validateConfigWithoutRegistry,
    type ValidConfigResult,
    type ConfigWithGraph
} from '../config/validation.ts';
import type { LinkedBundle } from '../linker/linked-bundle.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import { runChecks } from '../checks/check-runner.ts';
import type { Scheduler, PartialError } from './scheduler.ts';
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
    readonly linkedBundle: LinkedBundle;
    readonly resolveOptions: ResolveAndLinkOptions;
};

type PartialErrorResult = {
    type: 'partial';
    error: PartialError<ResolvedPackage>;
};

export type ResolveAndLinkFailure = CheckError | ConfigError | PartialErrorResult;
export type ResolveAndLinkAllResult = Result<readonly ResolvedPackage[], ResolveAndLinkFailure>;

export type Packtory = {
    buildAndPublishAll: (
        // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- we treat the config as unknown but want to provide autocompletion to the client
        config: PacktoryConfig | unknown,
        options: Options
    ) => Promise<PublishAllResult>;
    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- we treat the config as unknown but want to provide autocompletion to the client
    resolveAndLinkAll: (config: PacktoryConfigWithoutRegistry | unknown) => Promise<ResolveAndLinkAllResult>;
};

type PacktoryDependencies = {
    readonly packageProcessor: PackageProcessor;
    readonly scheduler: Scheduler;
};
export function createPacktory(dependencies: PacktoryDependencies): Packtory {
    const { packageProcessor, scheduler } = dependencies;

    type InternalResolveAndLinkFailure = CheckError | PartialErrorResult;

    async function resolveAndLinkAllValidated<TConfig extends { packages: readonly PackageConfig[] }>(
        config: ConfigWithGraph<TConfig>
    ): Promise<Result<readonly ResolvedPackage[], InternalResolveAndLinkFailure>> {
        const runResult = await scheduler.runForEachScheduledPackage<
            ResolvedPackage,
            LinkedBundle,
            ResolveAndLinkOptions,
            TConfig
        >({
            config,
            createOptions: (context) => {
                const { packageName, existing, config: validatedConfig } = context;
                // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- ok in this case
                const sanitizedConfig = validatedConfig.packtoryConfig as unknown as PacktoryConfigWithoutRegistry;

                return configToResolveAndLinkOptions(
                    packageName,
                    validatedConfig.packageConfigs,
                    sanitizedConfig,
                    existing
                );
            },
            execute: async (resolveOptions) => {
                const linkedBundle = await packageProcessor.resolveAndLink(resolveOptions);
                return {
                    name: resolveOptions.name,
                    linkedBundle,
                    resolveOptions
                } satisfies ResolvedPackage;
            },
            selectNext: (params) => {
                const { result } = params;
                return result.linkedBundle;
            },
            emitScheduledEvents: true
        });

        if (runResult.isErr) {
            return Result.err({ type: 'partial', error: runResult.error });
        }

        const resolvedPackages = runResult.value;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- ok in this case
        const sanitizedConfig = config.packtoryConfig as unknown as PacktoryConfigWithoutRegistry;
        const checkIssues = runChecks({
            settings: sanitizedConfig.checks ?? {},
            bundles: resolvedPackages.map((resolvedPackage) => {
                return resolvedPackage.linkedBundle;
            })
        });

        if (checkIssues.length > 0) {
            return Result.err({ type: 'checks', issues: checkIssues });
        }

        return Result.ok(resolvedPackages);
    }

    async function determineVersionAndPublishAll(
        config: ValidConfigResult,
        resolvedPackages: readonly ResolvedPackage[],
        options: Options
    ): Promise<Result<readonly BuildAndPublishResult[], PartialError<BuildAndPublishResult>>> {
        const linkedBundlesByName = new Map<string, LinkedBundle>(
            resolvedPackages.map((resolvedPackage) => {
                return [resolvedPackage.name, resolvedPackage.linkedBundle];
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
            execute: async (buildOptions) => {
                const linkedBundle = linkedBundlesByName.get(buildOptions.name);
                if (linkedBundle === undefined) {
                    throw new Error(`Linked bundle for package "${buildOptions.name}" is missing`);
                }

                const processorOptions: DetermineVersionAndPublishOptions = {
                    linkedBundle,
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

    async function resolveAndLinkAllPublic(config: unknown): Promise<ResolveAndLinkAllResult> {
        const validation = validateConfigWithoutRegistry(config);
        if (validation.isErr) {
            return Result.err({ type: 'config', issues: validation.error });
        }

        const result = await resolveAndLinkAllValidated(validation.value);
        if (result.isErr) {
            if (result.error.type === 'partial') {
                return Result.err({ type: 'partial', error: result.error.error });
            }
            return Result.err(result.error);
        }
        return Result.ok(result.value);
    }

    // eslint-disable-next-line max-statements -- needs to be refactored
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
            if (resolvedBundlesResult.error.type === 'partial') {
                return Result.err({
                    type: 'partial',
                    succeeded: [],
                    failures: resolvedBundlesResult.error.error.failures
                });
            }

            return Result.err(resolvedBundlesResult.error);
        }

        const publishResult = await determineVersionAndPublishAll(
            validation.value,
            resolvedBundlesResult.value,
            options
        );

        if (publishResult.isErr) {
            return Result.err({
                type: 'partial',
                ...publishResult.error
            });
        }

        return Result.ok(publishResult.value);
    }

    return {
        buildAndPublishAll: buildAndPublishAllPublic,
        resolveAndLinkAll: resolveAndLinkAllPublic
    };
}
