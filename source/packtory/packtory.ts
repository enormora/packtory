import { Result } from 'true-myth';
import type { PacktoryConfig, PacktoryConfigWithoutRegistry } from '../config/config.ts';
import { validateConfig, type ValidConfigResult } from '../config/validation.ts';
import type { LinkedBundle } from '../linker/linked-bundle.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
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

export type PublishFailure = ConfigError | (PartialError<BuildAndPublishResult> & { type: 'partial' });
export type PublishAllResult = Result<readonly BuildAndPublishResult[], PublishFailure>;

export type Packtory = {
    buildAndPublishAll: (
        // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- we treat the config as unknown but want to provide autocompletion to the client
        config: PacktoryConfig | unknown,
        options: Options
    ) => Promise<PublishAllResult>;
};

type PacktoryDependencies = {
    readonly packageProcessor: PackageProcessor;
    readonly scheduler: Scheduler;
};
export function createPacktory(dependencies: PacktoryDependencies): Packtory {
    const { packageProcessor, scheduler } = dependencies;

    type ResolvedPackage = {
        readonly name: string;
        readonly linkedBundle: LinkedBundle;
        readonly resolveOptions: ResolveAndLinkOptions;
    };

    async function resolveAndLinkAll(
        config: ValidConfigResult
    ): Promise<Result<readonly ResolvedPackage[], PartialError<ResolvedPackage>>> {
        return scheduler.runForEachScheduledPackage<ResolvedPackage, LinkedBundle, ResolveAndLinkOptions>({
            config,
            createOptions: (context) => {
                const { packageName, existing, config: validatedConfig } = context;
                const { registrySettings: _registrySettings, ...configWithoutRegistry } =
                    validatedConfig.packtoryConfig;
                const sanitizedConfig: PacktoryConfigWithoutRegistry = configWithoutRegistry;

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
            }
        });
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
            BuildAndPublishOptions
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
            createProgressEvent: (params) => {
                const { result } = params;
                return {
                    version: result.bundle.packageJson.version,
                    status: result.status
                };
            }
        });
    }

    return {
        async buildAndPublishAll(config, options) {
            const result = validateConfig(config);

            if (result.isErr) {
                return Result.err({
                    type: 'config',
                    issues: result.error
                });
            }

            const resolvedBundlesResult = await resolveAndLinkAll(result.value);
            if (resolvedBundlesResult.isErr) {
                return Result.err({
                    type: 'partial',
                    succeeded: [],
                    failures: resolvedBundlesResult.error.failures
                });
            }

            const publishResult = await determineVersionAndPublishAll(
                result.value,
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
    };
}
