import type { SourceFile } from 'ts-morph';
import {
    createPreparedModuleGraph,
    type PreparedModule,
    type PreparedModuleGraph
} from '../exports/prepared-module-graph.ts';
import { resolveNamespaceExport } from '../exports/namespace-export-value.ts';
import { hasDynamicScope } from '../dynamic-scope.ts';
import type { RuntimeModuleResolver } from '../runtime-module-resolution.ts';
import type { ModuleExportModel } from '../exports/module-export-model.ts';
import { createSourceEvaluation } from './constant-evaluation.ts';
import { createModuleBindingEvaluator, type ModuleBindingEvaluator } from './module-binding-evaluation.ts';
import { moduleDependenciesInitialize, moduleInitializesBinding } from './module-initialization.ts';
import type { EvaluatedValue } from './primitive-value.ts';

type ConstantModuleValue = { readonly kind: 'constant'; readonly value: EvaluatedValue; };
type NamespaceModuleValue = { readonly kind: 'namespace'; readonly source: SourceFile; };
export type ModuleValue = ConstantModuleValue | NamespaceModuleValue;
type ModuleConstants = {
    readonly initialized: boolean;
    readonly exports: ReadonlyMap<string, ModuleValue>;
};
export type ModuleConstantSnapshot = {
    readonly modules: ReadonlyMap<SourceFile, ModuleConstants>;
    readonly resolveModule: RuntimeModuleResolver;
};

export function exportedModuleValue(
    source: SourceFile,
    name: string,
    graph: PreparedModuleGraph,
    evaluate: ModuleBindingEvaluator
): ModuleValue | undefined {
    if (graph.index.status(source, name) !== 'unique') {
        return undefined;
    }
    const namespace = resolveNamespaceExport(source, name, graph.index.models, graph.resolveModule);
    if (namespace !== undefined) {
        return { kind: 'namespace', source: namespace };
    }
    const binding = graph.index.binding(source, name);
    const value = binding === undefined ? undefined : evaluate(binding.declarationNode);
    return value === undefined ? undefined : { kind: 'constant', value };
}

function exportValues(
    model: ModuleExportModel,
    graph: PreparedModuleGraph,
    evaluate: ModuleBindingEvaluator
): ReadonlyMap<string, ModuleValue> {
    if (!model.closed || hasDynamicScope(model.source)) {
        return new Map();
    }
    return new Map(
        Array.from(graph.index.candidates(model.source)).flatMap(function (name) {
            const value = exportedModuleValue(model.source, name, graph, evaluate);
            return value === undefined ? [] : [ [ name, value ] as const ];
        })
    );
}

export function createModuleConstantSnapshot(
    files: readonly PreparedModule[],
    resolveExternal: RuntimeModuleResolver
): ModuleConstantSnapshot {
    const graph = createPreparedModuleGraph(files);
    const resolveLocal = graph.resolveModule;
    const resolveModule: RuntimeModuleResolver = function (specifier, source) {
        return resolveLocal(source, specifier) ?? resolveExternal(specifier, source);
    };
    const evaluate = createModuleBindingEvaluator({
        evaluateSource: createSourceEvaluation,
        initializesBinding(declaration) {
            return moduleInitializesBinding(declaration, resolveModule);
        }
    });
    return {
        resolveModule,
        modules: new Map(Array.from(graph.index.models.values(), function (model) {
            const { source } = model;
            return [ source, {
                initialized: model.closed &&
                    moduleDependenciesInitialize(source, resolveModule),
                exports: exportValues(model, graph, evaluate)
            } ];
        }))
    };
}
