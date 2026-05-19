import type { SourceFile } from 'ts-morph';
import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.ts';
import type { AnalyzedBundle, DeadCodeEliminator } from './analyzed-bundle.ts';
import { buildAnalyzedResource, type AnalysisContext } from './code-file-analyzer.ts';
import { buildCrossBundleSeeds, type CrossBundleInput } from './cross-bundle/cross-bundle-seeds.ts';
import { maybeEmitElimination } from './elimination-emitter.ts';
import { loadBundle, type CreateProject, type LoadedBundle } from './load-bundle.ts';
import { buildMapPathTransformIndex, recomposePairedSourceMaps } from './source-map-recomposition.ts';
import { computeSideEffectsField } from './side-effects-field.ts';

function crossBundleInputFrom(loaded: LoadedBundle): CrossBundleInput {
    const sourceFiles: SourceFile[] = [];
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
    const outputs = loaded.loaded.map((entry) => {
        return buildAnalyzedResource(entry, context);
    });
    const transformsByMapPath = buildMapPathTransformIndex(outputs);
    const contents = outputs.map((output) => {
        return output.resource;
    });
    const finalContents = recomposePairedSourceMaps(contents, transformsByMapPath);
    return {
        ...loaded.input.bundle,
        contents: finalContents,
        sideEffectsField: computeSideEffectsField(finalContents)
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
            const loadedBundles = inputs.map((input) => {
                return loadBundle(createProject, input);
            });
            const seedMap = buildCrossBundleSeeds(loadedBundles.map(crossBundleInputFrom));
            const analyzed = loadedBundles.map((loaded) => {
                return analyzeBundleWithSeeds(loaded, seedMap.get(loaded.input.bundle.name));
            });
            maybeEmitElimination(
                progressBroadcaster,
                inputs.map((input) => {
                    return input.bundle;
                }),
                analyzed
            );
            return analyzed;
        }
    };
}
