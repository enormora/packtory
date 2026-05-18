import type { Result } from 'true-myth';
import type { PacktoryConfig } from '../../config/config.ts';
import type { ValidConfigResult } from '../../config/validation.ts';
import { collectPublicModuleUsage } from '../../package-surface/public-module-usage.ts';
import { withFailureCapture } from '../../report/decorators.ts';
import { configToBuildAndPublishOptions, type BuildAndPublishOptions } from '../map-config.ts';
import type {
    BuildAndPublishResult,
    DetermineVersionAndPublishOptions,
    PackageProcessor
} from '../package-processor.ts';
import type { BuildAndPublishAllOptions, ProgressBroadcaster } from '../packtory-results.ts';
import type { ResolvedPackage } from '../resolved-package.ts';
import type { PartialError, Scheduler as PacktoryScheduler } from '../scheduler.ts';

type VersionedBundleWithManifest = BuildAndPublishResult['bundle'];

export type PublishStageDependencies = {
    readonly packageProcessor: PackageProcessor;
    readonly scheduler: PacktoryScheduler;
    readonly progressBroadcaster: ProgressBroadcaster;
};

export async function determineVersionAndPublishAll(
    dependencies: PublishStageDependencies,
    config: ValidConfigResult,
    resolvedPackages: readonly ResolvedPackage[],
    options: BuildAndPublishAllOptions
): Promise<Result<readonly BuildAndPublishResult[], PartialError<BuildAndPublishResult>>> {
    const analyzedBundlesByName: Readonly<Record<string, ResolvedPackage['analyzedBundle']>> = Object.fromEntries(
        resolvedPackages.map((resolvedPackage) => {
            return [resolvedPackage.name, resolvedPackage.analyzedBundle];
        })
    );
    const publicModuleUsageByName = collectPublicModuleUsage(
        resolvedPackages.map((resolvedPackage) => {
            return resolvedPackage.analyzedBundle;
        })
    );

    return dependencies.scheduler.runForEachScheduledPackage<
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
        execute: withFailureCapture(dependencies.progressBroadcaster.provider, 'publish', async (buildOptions) => {
            const analyzedBundle = analyzedBundlesByName[buildOptions.name];
            if (analyzedBundle === undefined) {
                throw new Error(`Analyzed bundle for package "${buildOptions.name}" is missing`);
            }

            const processorOptions: DetermineVersionAndPublishOptions = {
                analyzedBundle,
                buildOptions,
                substitutionPublicModuleSourcePaths: publicModuleUsageByName.get(buildOptions.name)
            };

            if (options.dryRun) {
                return dependencies.packageProcessor.tryBuildAndPublish(processorOptions);
            }
            return dependencies.packageProcessor.buildAndPublish(processorOptions);
        }),
        selectNext: (params) => {
            return params.result.bundle;
        },
        emitScheduledEvents: false,
        createProgressEvent: (params) => {
            return {
                version: params.result.bundle.packageJson.version,
                status: params.result.status
            };
        }
    });
}
