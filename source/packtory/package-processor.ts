import type { DeadCodeEliminator } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { BundleEmitter } from '../bundle-emitter/emitter.ts';
import type { BundleLinker } from '../linker/linker.ts';
import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.ts';
import type { ResourceResolver } from '../resource-resolver/resource-resolver.ts';
import type { SbomFileBuilder } from '../sbom/sbom-file.ts';
import type { VersionManager } from '../version-manager/manager.ts';
import type { BuildOptions, ResolveAndLinkOptions } from './map-config.ts';
import { createResolveAndBuildOperations } from './package-processor-build.ts';
import {
    createPublishOperations,
    type BuildAndPublishResult as PublishBuildAndPublishResult,
    type DetermineVersionAndPublishOptions as PublishDetermineVersionAndPublishOptions
} from './package-processor-publish.ts';

export type BuildAndPublishResult = PublishBuildAndPublishResult;
export type DetermineVersionAndPublishOptions = PublishDetermineVersionAndPublishOptions;

export type PackageProcessorDependencies = {
    readonly progressBroadcaster: ProgressBroadcastProvider;
    readonly versionManager: VersionManager;
    readonly bundleEmitter: BundleEmitter;
    readonly linker: BundleLinker;
    readonly resourceResolver: ResourceResolver;
    readonly sbomFileBuilder: SbomFileBuilder;
    readonly deadCodeEliminator: DeadCodeEliminator;
};

export type PackageProcessor = {
    resolveAndLink: (options: ResolveAndLinkOptions) => Promise<Awaited<ReturnType<BundleLinker['linkBundle']>>>;
    build: (options: BuildOptions) => Promise<Awaited<ReturnType<VersionManager['addVersion']>>>;
    buildAndPublish: (options: DetermineVersionAndPublishOptions) => Promise<BuildAndPublishResult>;
    tryBuildAndPublish: (options: DetermineVersionAndPublishOptions) => Promise<BuildAndPublishResult>;
};

export function createPackageProcessor(dependencies: PackageProcessorDependencies): PackageProcessor {
    const resolveAndBuildOperations = createResolveAndBuildOperations(dependencies);
    const publishOperations = createPublishOperations(dependencies);

    return {
        ...resolveAndBuildOperations,
        ...publishOperations
    };
}
