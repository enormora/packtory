import type { SourceFile } from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../configuration/dead-code-elimination-settings.ts';
import type { TextTransformMap } from '../source-transformation/text-edits.ts';
import type { SideEffectClassifier } from './side-effect-classifier.ts';
import { createEmptyFileAnalysis, type AnalyzedBundleResource, type FileAnalysis } from './analyzed-bundle.ts';
import type { LoadedCodeResource, LoadedResource } from './load-resource.ts';
import { buildModuleAnalysis } from './liveness/module-analysis.ts';
import { bindingIdentifier } from './reachability/binding-identifier.ts';
import type { DeadCodeEliminationTrace } from './trace.ts';
import { applyRemovalPlan } from './transform/declaration-remover.ts';

export type AnalysisContext = {
    readonly bundleName: string;
    readonly reachable: ReadonlySet<string>;
    readonly survivingExports: ReadonlyMap<string, ReadonlySet<string>>;
    readonly transformationsEnabled: boolean;
    readonly classifySideEffects: SideEffectClassifier;
    readonly deadCodeElimination?: DeadCodeEliminationSettings | undefined;
    readonly trace: DeadCodeEliminationTrace;
};

type TransformRecord = {
    readonly textTransform: TextTransformMap;
};

export type AnalyzedResourceOutput = {
    readonly resource: AnalyzedBundleResource;
    readonly transforms: readonly TransformRecord[];
};

const noTransforms: readonly TransformRecord[] = [];

function allBindingNamesFor(loaded: LoadedCodeResource): ReadonlySet<string> {
    const names = new Set<string>();
    for (const binding of loaded.bindings) {
        names.add(binding.name);
    }
    return names;
}

function reachableBindingsFor(loaded: LoadedCodeResource, reachable: ReadonlySet<string>): ReadonlySet<string> {
    const { targetFilePath } = loaded.resource.fileDescription;
    return new Set(
        loaded.bindings.flatMap(function (binding) {
            return reachable.has(bindingIdentifier(targetFilePath, binding.name)) ? [ binding.name ] : [];
        })
    );
}

function transformSourceFile(
    loaded: LoadedCodeResource,
    context: AnalysisContext,
    sourceFile: SourceFile,
    surviving: ReadonlySet<string>
): TextTransformMap {
    const originalCode = sourceFile.getFullText();
    const { atoms } = applyRemovalPlan(sourceFile, {
        bundleName: context.bundleName,
        inputFilePath: loaded.resource.fileDescription.inputFilePath,
        targetFilePath: loaded.resource.fileDescription.targetFilePath,
        survivingNames: surviving,
        survivingExportNames: context.survivingExports.get(loaded.resource.fileDescription.targetFilePath),
        trace: context.trace
    });
    const transformedCode = sourceFile.getFullText();
    return {
        originalCode,
        transformedCode,
        atoms
    };
}

type CodeAnalysis = {
    readonly analysis: FileAnalysis;
    readonly reachableBindings: ReadonlySet<string>;
    readonly shouldTransform: boolean;
};

function analyzeCodeFile(loaded: LoadedCodeResource, context: AnalysisContext): CodeAnalysis {
    const moduleAnalysis = buildModuleAnalysis({
        inputFilePath: loaded.resource.fileDescription.inputFilePath,
        targetFilePath: loaded.resource.fileDescription.targetFilePath,
        sourceFile: loaded.sourceFile,
        originalLineFor: loaded.originalLineFor,
        bindings: loaded.bindings,
        deadCodeElimination: context.deadCodeElimination,
        classifySideEffects: context.classifySideEffects
    });
    const sideEffectStatements = moduleAnalysis.effects;
    const reachableBindings = reachableBindingsFor(loaded, context.reachable);
    const shouldTransform = context.transformationsEnabled;
    const survivingBindings = shouldTransform ? reachableBindings : allBindingNamesFor(loaded);
    return {
        analysis: { survivingBindings, sideEffectStatements, sideEffectImports: new Set<string>() },
        reachableBindings,
        shouldTransform
    };
}

export function buildAnalyzedResource(loaded: LoadedResource, context: AnalysisContext): AnalyzedResourceOutput {
    if (loaded.sourceFile === undefined) {
        return { resource: { ...loaded.resource, analysis: createEmptyFileAnalysis() }, transforms: noTransforms };
    }
    const { analysis, reachableBindings, shouldTransform } = analyzeCodeFile(loaded, context);
    if (!shouldTransform) {
        return { resource: { ...loaded.resource, analysis }, transforms: noTransforms };
    }
    const transformation = transformSourceFile(loaded, context, loaded.sourceFile, reachableBindings);
    const { transformedCode } = transformation;
    if (transformedCode === loaded.resource.fileDescription.content) {
        return { resource: { ...loaded.resource, analysis }, transforms: noTransforms };
    }
    return {
        resource: {
            ...loaded.resource,
            fileDescription: { ...loaded.resource.fileDescription, content: transformedCode },
            analysis
        },
        transforms: [
            ...loaded.transformations.map(function (textTransform) {
                return { textTransform };
            }),
            { textTransform: transformation }
        ]
    };
}
