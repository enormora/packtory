import type { SourceFile } from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../config/dead-code-elimination-settings.ts';
import { createEmptyFileAnalysis, type AnalyzedBundleResource, type FileAnalysis } from './analyzed-bundle.ts';
import type { LoadedCodeResource, LoadedResource } from './load-bundle.ts';
import { buildModuleAnalysis } from './liveness/module-analysis.ts';
import { bindingId } from './reachability/binding-id.ts';
import type { DeadCodeEliminationTrace } from './trace.ts';
import type { PositionAtom, TextTransformMap } from './transform/atom-translator.ts';
import { applyRemovalPlan } from './transform/declaration-remover.ts';

export type AnalysisContext = {
    readonly bundleName: string;
    readonly reachable: ReadonlySet<string>;
    readonly transformationsEnabled: boolean;
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

type TransformedSourceFile = {
    readonly transformedCode: string;
    readonly atoms: readonly PositionAtom[];
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
            return reachable.has(bindingId(targetFilePath, binding.name)) ? [ binding.name ] : [];
        })
    );
}

function transformSourceFile(
    loaded: LoadedCodeResource,
    context: AnalysisContext,
    sourceFile: SourceFile,
    surviving: ReadonlySet<string>
): TransformedSourceFile {
    const result = applyRemovalPlan(sourceFile, {
        bundleName: context.bundleName,
        inputFilePath: loaded.resource.fileDescription.inputFilePath,
        targetFilePath: loaded.resource.fileDescription.targetFilePath,
        survivingNames: surviving,
        trace: context.trace
    });
    return { transformedCode: sourceFile.getFullText(), atoms: result.atoms };
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
        bindings: loaded.bindings,
        deadCodeElimination: context.deadCodeElimination
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
    const originalCode = loaded.resource.fileDescription.content;
    const { transformedCode, atoms } = transformSourceFile(loaded, context, loaded.sourceFile, reachableBindings);
    if (transformedCode === originalCode) {
        return { resource: { ...loaded.resource, analysis }, transforms: noTransforms };
    }
    return {
        resource: {
            ...loaded.resource,
            fileDescription: { ...loaded.resource.fileDescription, content: transformedCode },
            analysis
        },
        transforms: [ { textTransform: { originalCode, transformedCode, atoms } } ]
    };
}
