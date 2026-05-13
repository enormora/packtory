import { Result } from 'true-myth';
import type { DeadCodeEliminator } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { ValidConfigWithoutRegistryResult } from '../config/validation.ts';
import { resolveRootsAndSurface } from '../resource-resolver/resource-resolve-options.ts';
import { withFailureCapture } from '../report/decorators.ts';
import { configToResolveAndLinkOptions, type ResolveAndLinkOptions } from './map-config.ts';
import type { PackageProcessor } from './package-processor.ts';
import { resolvePartialFailure, type PartialErrorResult, type ProgressBroadcaster } from './packtory-results.ts';
import type { PartialError, Scheduler as PacktoryScheduler } from './scheduler.ts';
import { buildChecksResult, createResolvedPackage, type CheckError, type ResolvedPackage } from './resolved-package.ts';

type LinkedBundle = Awaited<ReturnType<PackageProcessor['resolveAndLink']>>;

type LinkedPackage = {
    readonly name: string;
    readonly linkedBundle: LinkedBundle;
    readonly resolveOptions: ResolveAndLinkOptions;
};

export type InternalResolveAndLinkFailure = CheckError | PartialErrorResult;

type ResolveDependencies = {
    readonly packageProcessor: PackageProcessor;
    readonly scheduler: PacktoryScheduler;
    readonly deadCodeEliminator: DeadCodeEliminator;
    readonly progressBroadcaster: ProgressBroadcaster;
};

function resolveTransformationsEnabledByName(
    validated: ValidConfigWithoutRegistryResult
): ReadonlyMap<string, boolean> {
    const commonEnabled = validated.packtoryConfig.commonPackageSettings?.deadCodeElimination?.enabled;
    return new Map(
        validated.packtoryConfig.packages.map((packageConfig) => {
            const packageEnabled = packageConfig.deadCodeElimination?.enabled;
            return [packageConfig.name, packageEnabled ?? commonEnabled ?? true];
        })
    );
}

function createResolveOptions(
    packageName: string,
    existing: readonly LinkedBundle[],
    config: ValidConfigWithoutRegistryResult
): ResolveAndLinkOptions {
    return configToResolveAndLinkOptions(packageName, config.packageConfigs, config.packtoryConfig, existing);
}

async function resolvePackages(
    dependencies: Pick<ResolveDependencies, 'packageProcessor' | 'progressBroadcaster' | 'scheduler'>,
    config: ValidConfigWithoutRegistryResult
): Promise<Result<readonly LinkedPackage[], PartialError<LinkedPackage>>> {
    return dependencies.scheduler.runForEachScheduledPackage<
        LinkedPackage,
        LinkedBundle,
        ResolveAndLinkOptions,
        ValidConfigWithoutRegistryResult['packtoryConfig']
    >({
        config,
        createOptions: (context) => {
            const options = createResolveOptions(context.packageName, context.existing, context.config);
            const normalizedInputs = resolveRootsAndSurface(options);
            if (dependencies.progressBroadcaster.provider.hasSubscribers('inputsResolved')) {
                dependencies.progressBroadcaster.provider.emit('inputsResolved', {
                    packageName: options.name,
                    entryPoints: Object.values(normalizedInputs.roots).map((root) => {
                        return root.js;
                    }),
                    sourceFileCount: 0,
                    siblingVersions: {}
                });
            }
            return options;
        },
        execute: withFailureCapture(
            dependencies.progressBroadcaster.provider,
            'resolveAndLink',
            async (resolveOptions) => {
                const linkedBundle = await dependencies.packageProcessor.resolveAndLink(resolveOptions);
                return {
                    name: resolveOptions.name,
                    linkedBundle,
                    resolveOptions
                } satisfies LinkedPackage;
            }
        ),
        selectNext: (params) => {
            return params.result.linkedBundle;
        },
        emitScheduledEvents: true
    });
}

async function analyzeResolvedPackages(
    dependencies: Pick<ResolveDependencies, 'deadCodeEliminator'>,
    config: ValidConfigWithoutRegistryResult,
    linkedPackages: readonly LinkedPackage[]
): Promise<readonly ResolvedPackage[]> {
    const transformationsEnabledByName = resolveTransformationsEnabledByName(config);
    const analyzedBundles = await dependencies.deadCodeEliminator.eliminate(
        linkedPackages.map((linkedPackage) => {
            const transformationsEnabled = transformationsEnabledByName.get(linkedPackage.name);
            if (transformationsEnabled === undefined) {
                throw new Error(`Missing transformations flag for package "${linkedPackage.name}"`);
            }
            return { bundle: linkedPackage.linkedBundle, transformationsEnabled };
        })
    );

    return linkedPackages.map((linkedPackage, index) => {
        const analyzedBundle = analyzedBundles[index];
        if (analyzedBundle === undefined) {
            throw new Error(`Analyzed bundle missing for package "${linkedPackage.name}"`);
        }
        return createResolvedPackage(linkedPackage.name, analyzedBundle, linkedPackage.resolveOptions);
    });
}

export function createResolveAndLinkAllValidated(
    dependencies: ResolveDependencies
): (
    config: ValidConfigWithoutRegistryResult
) => Promise<Result<readonly ResolvedPackage[], InternalResolveAndLinkFailure>> {
    return async function resolveAndLinkAllValidated(
        config: ValidConfigWithoutRegistryResult
    ): Promise<Result<readonly ResolvedPackage[], InternalResolveAndLinkFailure>> {
        const runResult = await resolvePackages(dependencies, config);
        if (runResult.isErr) {
            return Result.err(resolvePartialFailure({ succeeded: [], failures: runResult.error.failures }));
        }

        const resolvedPackages = await analyzeResolvedPackages(dependencies, config, runResult.value);
        return buildChecksResult(config, resolvedPackages);
    };
}
