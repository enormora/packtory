import {
    createResolveAndBuildOperations,
    type ResolveAndBuildDependencies,
    type ResolveAndBuildOperations
} from './package-processor-build.ts';
import type { PublishDependencies } from './package-processor-publish-dependencies.ts';
import { createPublishOperations, type PublishOperations } from './package-processor-publish.ts';

export type BuildAndPublishResult = Awaited<ReturnType<PublishOperations['tryBuildAndPublish']>>;

export type PackageProcessorDependencies = PublishDependencies & ResolveAndBuildDependencies;

export type PackageProcessor = PublishOperations & ResolveAndBuildOperations;

export function createPackageProcessor(dependencies: PackageProcessorDependencies): PackageProcessor {
    const resolveAndBuildOperations = createResolveAndBuildOperations(dependencies);
    const publishOperations = createPublishOperations(dependencies);

    return {
        ...resolveAndBuildOperations,
        ...publishOperations
    };
}
