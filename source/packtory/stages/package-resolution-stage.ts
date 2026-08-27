import { mapValues } from 'remeda';
import type { Result } from 'true-myth';
import { declarationCompanionCandidates } from '../../common/declaration-companion-paths.ts';
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

function collectPromotedSourcePathsByPackageName(
    linkedPackages: readonly LinkedPackage[]
): ReadonlyMap<string, ReadonlySet<string>> {
    const promotedSourcePathsByPackageName = new Map<string, Set<string>>();
    for (const linkedPackage of linkedPackages) {
        for (
            const [ packageName, sourceFilePaths ] of linkedPackage.linkedBundle.substitutedSourceFilePathsByPackageName
        ) {
            const existing = promotedSourcePathsByPackageName.get(packageName) ?? new Set<string>();
            for (const sourceFilePath of sourceFilePaths) {
                if (declarationCompanionCandidates(sourceFilePath).length > 0) {
                    existing.add(sourceFilePath);
                }
            }
            promotedSourcePathsByPackageName.set(packageName, existing);
        }
    }
    return promotedSourcePathsByPackageName;
}

function hasPromotionCandidates(promotedSourcePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>): boolean {
    return Array.from(promotedSourcePathsByPackageName.values()).some(function (sourceFilePaths) {
        return sourceFilePaths.size > 0;
    });
}

async function resolvePackagesWithPromotions(
    dependencies: PackageResolutionDependencies,
    config: ValidConfigWithoutRegistryResult,
    promotedSourcePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>,
    emitScheduledEvents: boolean
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
                const promotedSourcePaths = promotedSourcePathsByPackageName.get(resolveOptions.name) ?? new Set();
                const linkedBundle = promotedSourcePaths.size === 0
                    ? await dependencies.packageProcessor.resolveAndLink(resolveOptions)
                    : await dependencies
                        .packageProcessor
                        .resolveAndLinkWithPromotedDeclarationCompanions(resolveOptions, promotedSourcePaths);
                return {
                    name: resolveOptions.name,
                    linkedBundle,
                    resolveOptions
                };
            }
        ),
        selectNext(input) {
            return input.result.linkedBundle;
        },
        emitScheduledEvents
    });
}

export async function resolvePackages(
    dependencies: PackageResolutionDependencies,
    config: ValidConfigWithoutRegistryResult
): Promise<Result<readonly LinkedPackage[], PartialError<LinkedPackage>>> {
    const firstPassResult = await resolvePackagesWithPromotions(dependencies, config, new Map(), true);
    if (firstPassResult.isErr) {
        return firstPassResult;
    }

    const promotedSourcePathsByPackageName = collectPromotedSourcePathsByPackageName(firstPassResult.value);
    if (!hasPromotionCandidates(promotedSourcePathsByPackageName)) {
        return firstPassResult;
    }

    return await resolvePackagesWithPromotions(dependencies, config, promotedSourcePathsByPackageName, false);
}
