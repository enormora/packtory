/* eslint-disable import/max-dependencies -- This orchestration module wires the elimination pipeline stages. */
import type { SourceFile } from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../config/dead-code-elimination-settings.ts';
import {
    createEmptyFileAnalysis,
    type AnalyzedBundle,
    type AnalyzedBundleResource,
    type DeadCodeEliminator,
    type FileAnalysis
} from './analyzed-bundle.ts';
import { maybeEmitElimination } from './elimination-emitter.ts';
import { buildCrossBundleSeeds, type CrossBundleInput } from './cross-bundle/cross-bundle-seeds.ts';
import {
    loadBundle,
    type CreateProject,
    type LoadedBundle,
    type LoadedCodeResource,
    type LoadedResource
} from './load-bundle.ts';
import { bindingId } from './reachability/reachability.ts';
import { classifySideEffects } from './side-effect-classifier.ts';
import { computeSideEffectsField } from './side-effects-field.ts';
import { applyRemovalPlan, type PositionAtom } from './transform/declaration-remover.ts';
import { recomposeSourceMap } from './transform/source-map-composer.ts';

type ProgressBroadcastProvider = Parameters<typeof maybeEmitElimination>[0];

function allBindingNamesFor(loaded: LoadedCodeResource): ReadonlySet<string> {
    const names = new Set<string>();
    for (const binding of loaded.bindings) {
        names.add(binding.name);
    }
    return names;
}

function directlyReachableBindingsFor(loaded: LoadedCodeResource, reachable: ReadonlySet<string>): ReadonlySet<string> {
    const { sourceFilePath } = loaded.resource.fileDescription;
    return new Set(
        loaded.bindings.flatMap((binding) => {
            return reachable.has(bindingId(sourceFilePath, binding.name)) ? [binding.name] : [];
        })
    );
}

const reachableBindingsFor = directlyReachableBindingsFor;

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
    readonly deadCodeElimination?: DeadCodeEliminationSettings | undefined;
};

type CodeAnalysis = {
    readonly analysis: FileAnalysis;
    readonly reachableBindings: ReadonlySet<string>;
    readonly shouldTransform: boolean;
};

function analyzeCodeFile(loaded: LoadedCodeResource, context: AnalysisContext): CodeAnalysis {
    const sideEffectStatements = classifySideEffects(loaded.sourceFile, context.deadCodeElimination);
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
        localReachable: loaded.reachability.localReachable
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
