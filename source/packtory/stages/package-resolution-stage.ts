import { mapValues } from 'remeda';
import type { Result } from 'true-myth';
import { declarationCompanionCandidates } from '../../common/declaration-companion-paths.ts';
import type { ValidConfigurationWithoutRegistryResult } from '../../configuration/validation.ts';
import { resolveRootsAndSurface } from '../../resource-resolver/resource-resolve-options.ts';
import { withFailureCapture } from '../../report/decorators.ts';
import { configurationToResolveAndLinkOptions, type ResolveAndLinkOptions } from '../map-configuration.ts';
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
    configuration: ValidConfigurationWithoutRegistryResult
): ResolveAndLinkOptions {
    return configurationToResolveAndLinkOptions(
        packageName,
        configuration.packageConfigurations,
        configuration.packtoryConfiguration,
        existing
    );
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
            return root.javaScript;
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
            const [ packageName, inputFilePaths ] of linkedPackage.linkedBundle.substitutedInputFilePathsByPackageName
        ) {
            const existing = promotedSourcePathsByPackageName.get(packageName) ?? new Set<string>();
            for (const inputFilePath of inputFilePaths) {
                if (declarationCompanionCandidates(inputFilePath).length > 0) {
                    existing.add(inputFilePath);
                }
            }
            promotedSourcePathsByPackageName.set(packageName, existing);
        }
    }
    return promotedSourcePathsByPackageName;
}

function hasPromotionCandidates(promotedSourcePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>): boolean {
    return Array.from(promotedSourcePathsByPackageName.values()).some(function (inputFilePaths) {
        return inputFilePaths.size > 0;
    });
}

async function resolvePackagesWithPromotions(
    dependencies: PackageResolutionDependencies,
    configuration: ValidConfigurationWithoutRegistryResult,
    promotedSourcePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>,
    emitScheduledEvents: boolean
): Promise<Result<readonly LinkedPackage[], PartialError<LinkedPackage>>> {
    return dependencies.scheduler.runForEachScheduledPackage<
        LinkedPackage,
        LinkedBundle,
        ResolveAndLinkOptions,
        ValidConfigurationWithoutRegistryResult['packtoryConfiguration']
    >({
        configuration,
        createOptions(context) {
            const options = createResolveOptions(context.packageName, context.existing, context.configuration);
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
    configuration: ValidConfigurationWithoutRegistryResult
): Promise<Result<readonly LinkedPackage[], PartialError<LinkedPackage>>> {
    const firstPassResult = await resolvePackagesWithPromotions(dependencies, configuration, new Map(), true);
    if (firstPassResult.isErr) {
        return firstPassResult;
    }

    const promotedSourcePathsByPackageName = collectPromotedSourcePathsByPackageName(firstPassResult.value);
    if (!hasPromotionCandidates(promotedSourcePathsByPackageName)) {
        return firstPassResult;
    }

    return await resolvePackagesWithPromotions(dependencies, configuration, promotedSourcePathsByPackageName, false);
}
