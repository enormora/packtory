import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.ts';
import type { AnalyzedBundle, DeadCodeEliminator } from './analyzed-bundle.ts';
import { buildAnalyzedResource, type AnalysisContext } from './code-file-analyzer.ts';
import { buildCrossBundleSeeds, type CrossBundleInput } from './cross-bundle/cross-bundle-seeds.ts';
import { indexSourceFiles, recomputeDependencyMetadata } from './dependency-metadata.ts';
import { maybeEmitElimination } from './elimination-emitter.ts';
import { loadBundle, type CreateProject, type LoadedBundle } from './load-bundle.ts';
import { pruneContents } from './liveness/resource-retention.ts';
import { buildMapPathTransformIndex, recomposePairedSourceMaps } from './source-map-recomposition.ts';
import { computeSideEffectsField } from './side-effects-field.ts';

type LoadedSourceFile = NonNullable<LoadedBundle['loaded'][number]['sourceFile']>;

function crossBundleInputFrom(loaded: LoadedBundle): CrossBundleInput {
    const sourceFiles: LoadedSourceFile[] = [];

    for (const entry of loaded.loaded) {
        if (entry.sourceFile !== undefined) {
            sourceFiles.push(entry.sourceFile);
        }
    }

    return {
        bundle: loaded.input.bundle,
        sourceFiles,
        fileBindings: loaded.fileBindings,
        localReachable: loaded.reachability.localReachable
    };
}

function analyzeBundleWithSeeds(loaded: LoadedBundle, externalSeeds: ReadonlySet<string> | undefined): AnalyzedBundle {
    const context: AnalysisContext = {
        reachable: loaded.reachability.expandWith(externalSeeds),
        transformationsEnabled: loaded.input.transformationsEnabled,
        deadCodeElimination: loaded.input.deadCodeElimination
    };
    const outputs = loaded.loaded.map(function (entry) {
        return buildAnalyzedResource(entry, context);
    });
    const transformsByMapPath = buildMapPathTransformIndex(
        outputs,
        loaded.input.bundle.sourceMapTransformsByTargetPath
    );
    const contents = outputs.map(function (output) {
        return output.resource;
    });
    const finalContents = recomposePairedSourceMaps(contents, transformsByMapPath);
    const sourceFileIndex = indexSourceFiles(loaded);
    const prePruneMetadata = recomputeDependencyMetadata(
        loaded.input.bundle,
        finalContents,
        sourceFileIndex
    );
    const prunedContents = pruneContents(
        loaded.input.bundle,
        prePruneMetadata.contents,
        loaded.input.transformationsEnabled
    );
    const dependencyMetadata = recomputeDependencyMetadata(
        loaded.input.bundle,
        prunedContents,
        sourceFileIndex
    );
    return {
        ...loaded.input.bundle,
        ...dependencyMetadata,
        sideEffectsField: computeSideEffectsField(dependencyMetadata.contents)
    };
}

export type DeadCodeEliminatorDependencies = {
    readonly createProject: CreateProject;
    readonly progressBroadcaster: ProgressBroadcastProvider;
};

export function createDeadCodeEliminator(dependencies: DeadCodeEliminatorDependencies): DeadCodeEliminator {
    const { createProject, progressBroadcaster } = dependencies;
    return {
        async eliminate(inputs) {
            const loadedBundles = inputs.map(function (input) {
                return loadBundle(createProject, input);
            });
            const seedMap = buildCrossBundleSeeds(loadedBundles.map(crossBundleInputFrom));
            const analyzed = loadedBundles.map(function (loaded) {
                return analyzeBundleWithSeeds(loaded, seedMap.get(loaded.input.bundle.name));
            });
            maybeEmitElimination(
                progressBroadcaster,
                inputs.map(function (input) {
                    return input.bundle;
                }),
                analyzed
            );
            return analyzed;
        }
    };
}
