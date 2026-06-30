import { mapValues } from 'remeda';
import type { Result } from 'true-myth';
import type { ValidConfigWithoutRegistryResult } from '../../config/validation.ts';
import { resolveRootsAndSurface } from '../../resource-resolver/resource-resolve-options.ts';
import { withFailureCapture } from '../../report/decorators.ts';
import { configToResolveAndLinkOptions, type ResolveAndLinkOptions } from '../map-config.ts';
import type { PackageProcessor } from '../package-processor.ts';
import type { ProgressBroadcaster } from '../packtory-results.ts';
import type { PartialError, Scheduler as PacktoryScheduler } from '../scheduler.ts';

type LinkedBundle = Awaited<ReturnType<PackageProcessor['resolveAndLink']>>;

export type LinkedPackage = {
    readonly name: string;
    readonly linkedBundle: LinkedBundle;
    readonly resolveOptions: ResolveAndLinkOptions;
};

export type PackageResolutionDependencies = {
    readonly packageProcessor: PackageProcessor;
    readonly scheduler: PacktoryScheduler;
    readonly progressBroadcaster: ProgressBroadcaster;
};

function createResolveOptions(
    packageName: string,
    existing: readonly LinkedBundle[],
    config: ValidConfigWithoutRegistryResult
): ResolveAndLinkOptions {
    return configToResolveAndLinkOptions(packageName, config.packageConfigs, config.packtoryConfig, existing);
}

function emitInputsResolved(
    dependencies: Pick<PackageResolutionDependencies, 'progressBroadcaster'>,
    options: ResolveAndLinkOptions
): void {
    if (!dependencies.progressBroadcaster.provider.hasSubscribers('inputsResolved')) {
        return;
    }
    const normalizedInputs = resolveRootsAndSurface(options);
    dependencies.progressBroadcaster.provider.emit('inputsResolved', {
        packageName: options.name,
        roots: mapValues(normalizedInputs.roots, function (root) {
            return root.js;
        }),
        sourceFileCount: 0,
        siblingVersions: {}
    });
}

export async function resolvePackages(
    dependencies: PackageResolutionDependencies,
    config: ValidConfigWithoutRegistryResult
): Promise<Result<readonly LinkedPackage[], PartialError<LinkedPackage>>> {
    return dependencies.scheduler.runForEachScheduledPackage<
        LinkedPackage,
        LinkedBundle,
        ResolveAndLinkOptions,
        ValidConfigWithoutRegistryResult['packtoryConfig']
    >({
        config,
        createOptions(context) {
            const options = createResolveOptions(context.packageName, context.existing, context.config);
            emitInputsResolved(dependencies, options);
            return options;
        },
        execute: withFailureCapture(
            dependencies.progressBroadcaster.provider,
            'resolveAndLink',
            async function (resolveOptions) {
                const linkedBundle = await dependencies.packageProcessor.resolveAndLink(resolveOptions);
                return {
                    name: resolveOptions.name,
                    linkedBundle,
                    resolveOptions
                };
            }
        ),
        selectNext(params) {
            return params.result.linkedBundle;
        },
        emitScheduledEvents: true
    });
}
