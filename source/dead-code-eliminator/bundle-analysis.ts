import type { AnalyzedBundle } from './analyzed-bundle.ts';
import { buildAnalyzedResource, type AnalysisContext, type AnalyzedResourceOutput } from './code-file-analyzer.ts';
import type { CrossBundleInput } from './cross-bundle/cross-bundle-seeds.ts';
import { indexSourceFiles, recomputeDependencyMetadata } from './dependency-metadata.ts';
import type { LoadedBundle } from './load-bundle.ts';
import { pruneContents } from './liveness/resource-retention.ts';
import { buildMapPathTransformIndex, recomposePairedSourceMaps } from './source-map-recomposition.ts';
import { removeEmptyModuleLinks } from './transform/empty-module-links.ts';
import { computeSideEffectsField } from './side-effects-field.ts';
import type { DeadCodeEliminationTrace } from './trace.ts';

export function crossBundleInputFrom(loaded: LoadedBundle): CrossBundleInput {
    return {
        bundle: loaded.input.bundle,
        fileBindings: loaded.fileBindings,
        localReachable: loaded.reachability.localReachable
    };
}

function analysisContextFor(
    loaded: LoadedBundle,
    externalSeeds: ReadonlySet<string> | undefined,
    trace: DeadCodeEliminationTrace
): AnalysisContext {
    const reachable = loaded.reachability.resolveWith(externalSeeds);
    return {
        bundleName: loaded.input.bundle.name,
        reachable: reachable.bindings,
        survivingExports: reachable.exports,
        transformationsEnabled: loaded.input.transformationsEnabled,
        deadCodeElimination: loaded.input.deadCodeElimination,
        classifySideEffects: loaded.classifySideEffects,
        trace
    };
}

function analyzeResources(loaded: LoadedBundle, context: AnalysisContext): readonly AnalyzedResourceOutput[] {
    const outputs = loaded.loaded.map(function (entry) {
        return buildAnalyzedResource(entry, context);
    });
    return loaded.input.transformationsEnabled ? removeEmptyModuleLinks(outputs, loaded.loaded) : outputs;
}

export function analyzeBundleWithSeeds(
    loaded: LoadedBundle,
    externalSeeds: ReadonlySet<string> | undefined,
    trace: DeadCodeEliminationTrace
): AnalyzedBundle {
    const context = analysisContextFor(loaded, externalSeeds, trace);
    const outputs = analyzeResources(loaded, context);
    const transformsByMapPath = buildMapPathTransformIndex(
        outputs,
        loaded.input.bundle.sourceMapTransformsByTargetPath
    );
    const contents = outputs.map(function (output) {
        return output.resource;
    });
    const finalContents = recomposePairedSourceMaps(contents, transformsByMapPath);
    const sourceFileIndex = indexSourceFiles(loaded);
    const dependencyMetadata = recomputeDependencyMetadata(
        loaded.input.bundle,
        finalContents,
        sourceFileIndex,
        function (resources) {
            return pruneContents(loaded.input.bundle, resources, loaded.input.transformationsEnabled, trace);
        }
    );
    return {
        ...loaded.input.bundle,
        ...dependencyMetadata,
        sideEffectsField: computeSideEffectsField(dependencyMetadata.contents)
    };
}
