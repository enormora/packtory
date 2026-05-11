import type { SourceFile } from 'ts-morph';
import {
    createEmptyFileAnalysis,
    type AnalyzedBundle,
    type AnalyzedBundleResource,
    type DeadCodeEliminator,
    type FileAnalysis
} from './analyzed-bundle.ts';
import { buildCrossBundleSeeds, type CrossBundleInput } from './cross-bundle/cross-bundle-seeds.ts';
import { loadBundle, type LoadedBundle, type LoadedCodeResource, type LoadedResource } from './load-bundle.ts';
import { bindingId, computeReachability } from './reachability/reachability.ts';
import { classifySideEffects } from './side-effect-classifier.ts';
import { computeSideEffectsField } from './side-effects-field.ts';
import { applyRemovalPlan, type PositionAtom } from './transform/declaration-remover.ts';
import { recomposeSourceMap } from './transform/source-map-composer.ts';

function allBindingNamesFor(loaded: LoadedCodeResource): ReadonlySet<string> {
    const names = new Set<string>();
    for (const binding of loaded.bindings) {
        names.add(binding.name);
    }
    return names;
}

function reachableBindingsFor(loaded: LoadedCodeResource, reachable: ReadonlySet<string>): ReadonlySet<string> {
    const { sourceFilePath } = loaded.resource.fileDescription;
    const surviving = new Set<string>();
    for (const binding of loaded.bindings) {
        if (reachable.has(bindingId(sourceFilePath, binding.name))) {
            surviving.add(binding.name);
        }
    }
    return surviving;
}

type TransformOutcome = {
    readonly transformedCode: string;
    readonly atoms: readonly PositionAtom[];
};

function transformSourceFile(sourceFile: SourceFile, surviving: ReadonlySet<string>): TransformOutcome {
    const result = applyRemovalPlan(sourceFile, { survivingNames: surviving });
    return { transformedCode: sourceFile.getFullText(), atoms: result.atoms };
}

type AnalysisContext = {
    readonly reachable: ReadonlySet<string>;
    readonly transformationsEnabled: boolean;
};

type CodeAnalysis = {
    readonly analysis: FileAnalysis;
    readonly reachableBindings: ReadonlySet<string>;
    readonly shouldTransform: boolean;
};

function analyzeCodeFile(loaded: LoadedCodeResource, context: AnalysisContext): CodeAnalysis {
    const sideEffectStatements = classifySideEffects(loaded.sourceFile);
    const reachableBindings = reachableBindingsFor(loaded, context.reachable);
    const shouldTransform = context.transformationsEnabled && sideEffectStatements.length === 0;
    const survivingBindings = shouldTransform ? reachableBindings : allBindingNamesFor(loaded);
    return {
        analysis: { survivingBindings, sideEffectStatements, sideEffectImports: new Set<string>() },
        reachableBindings,
        shouldTransform
    };
}

type TransformRecord = {
    readonly originalCode: string;
    readonly transformedCode: string;
    readonly atoms: readonly PositionAtom[];
};

type BuildOutput = {
    readonly resource: AnalyzedBundleResource;
    readonly transforms: readonly TransformRecord[];
};

const noTransforms: readonly TransformRecord[] = [];

function buildAnalyzedResource(loaded: LoadedResource, context: AnalysisContext): BuildOutput {
    if (loaded.sourceFile === undefined) {
        return { resource: { ...loaded.resource, analysis: createEmptyFileAnalysis() }, transforms: noTransforms };
    }
    const { analysis, reachableBindings, shouldTransform } = analyzeCodeFile(loaded, context);
    if (!shouldTransform) {
        return { resource: { ...loaded.resource, analysis }, transforms: noTransforms };
    }
    const originalCode = loaded.resource.fileDescription.content;
    const { transformedCode, atoms } = transformSourceFile(loaded.sourceFile, reachableBindings);
    if (transformedCode === originalCode) {
        return { resource: { ...loaded.resource, analysis }, transforms: noTransforms };
    }
    return {
        resource: {
            ...loaded.resource,
            fileDescription: { ...loaded.resource.fileDescription, content: transformedCode },
            analysis
        },
        transforms: [{ originalCode, transformedCode, atoms }]
    };
}

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
        localReachable: loaded.localReachable
    };
}

function recomposePairedSourceMaps(
    contents: readonly AnalyzedBundleResource[],
    transformsByMapPath: ReadonlyMap<string, TransformRecord>
): readonly AnalyzedBundleResource[] {
    return contents.map((resource) => {
        const transform = transformsByMapPath.get(resource.fileDescription.targetFilePath);
        if (transform === undefined) {
            return resource;
        }
        const recomposed = recomposeSourceMap({
            originalMap: resource.fileDescription.content,
            originalCode: transform.originalCode,
            transformedCode: transform.transformedCode,
            atoms: transform.atoms
        });
        return {
            ...resource,
            fileDescription: { ...resource.fileDescription, content: recomposed }
        };
    });
}

function buildMapPathTransformIndex(outputs: readonly BuildOutput[]): ReadonlyMap<string, TransformRecord> {
    return new Map<string, TransformRecord>(
        outputs.flatMap((output) => {
            return output.transforms.map((transform) => {
                return [`${output.resource.fileDescription.targetFilePath}.map`, transform] as const;
            });
        })
    );
}

function analyzeBundleWithSeeds(loaded: LoadedBundle, externalSeeds: ReadonlySet<string> | undefined): AnalyzedBundle {
    const { reachable } = computeReachability({
        files: loaded.fileBindings,
        entryPointFilePaths: loaded.entryPointFilePaths,
        externalSeeds
    });
    const context: AnalysisContext = {
        reachable,
        transformationsEnabled: loaded.input.transformationsEnabled
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

export function createDeadCodeEliminator(): DeadCodeEliminator {
    return {
        async eliminate(inputs) {
            const loadedBundles = inputs.map(loadBundle);
            const seedMap = buildCrossBundleSeeds(loadedBundles.map(crossBundleInputFrom));
            return loadedBundles.map((loaded) => {
                return analyzeBundleWithSeeds(loaded, seedMap.get(loaded.input.bundle.name));
            });
        }
    };
}
