import type { SourceFile } from 'ts-morph';
import {
    createPreparedModuleGraph,
    type PreparedModule,
    type PreparedModuleGraph
} from '../exports/prepared-module-graph.ts';
import { hasDynamicScope } from '../dynamic-scope.ts';
import type { RuntimeModuleResolver } from '../runtime-module-resolution.ts';
import type { ModuleExportModel } from '../exports/module-export-model.ts';
import { createSourceEvaluation, createSourceEvaluations } from './constant-evaluation.ts';
import { createModuleBindingEvaluator, type ModuleBindingEvaluator } from './module-binding-evaluation.ts';
import { createModuleInitialization } from './module-initialization.ts';
import { exportedModuleValue, type ModuleValue } from './module-export-value.ts';

type ModuleConstants = {
    readonly initialized: boolean;
    readonly exports: ReadonlyMap<string, ModuleValue>;
};
export type ModuleConstantSnapshot = {
    readonly modules: ReadonlyMap<SourceFile, ModuleConstants>;
    readonly resolveModule: RuntimeModuleResolver;
};

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
    const evaluateSource = createSourceEvaluations(createSourceEvaluation);
    const initialization = createModuleInitialization(resolveModule, evaluateSource);
    const evaluate = createModuleBindingEvaluator({
        evaluateSource,
        initializesBinding: initialization.initializesBinding
    });
    return {
        resolveModule,
        modules: new Map(Array.from(graph.index.models.values(), function (model) {
            const { source } = model;
            return [ source, {
                initialized: model.closed &&
                    initialization.dependenciesInitialize(source),
                exports: exportValues(model, graph, evaluate)
            } ];
        }))
    };
}
