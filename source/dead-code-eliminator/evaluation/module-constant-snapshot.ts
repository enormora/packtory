import { Node as TypeScriptMorphNode, type SourceFile } from 'ts-morph';
import {
    createPreparedModuleGraph,
    type PreparedModule,
    type PreparedModuleGraph
} from '../exports/prepared-module-graph.ts';
import { resolveNamespaceExport } from '../exports/namespace-export-value.ts';
import { hasDynamicScope } from '../dynamic-scope.ts';
import type { RuntimeModuleResolver } from '../runtime-module-resolution.ts';
import { constantBindingExpression } from './imported-constant.ts';
import { createSourceEvaluation, type SourceEvaluation } from './constant-evaluation.ts';
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
type BindingEvaluator = (declaration: TypeScriptMorphNode) => EvaluatedValue | undefined;

function bindingValue(
    declaration: TypeScriptMorphNode,
    resolveModule: RuntimeModuleResolver,
    evaluation: SourceEvaluation
): EvaluatedValue | undefined {
    if (
        !(TypeScriptMorphNode.isVariableDeclaration(declaration) ||
            TypeScriptMorphNode.isExportAssignment(declaration))
    ) {
        return undefined;
    }
    const expression = constantBindingExpression(declaration);
    if (expression === undefined || !moduleInitializesBinding(declaration, resolveModule)) {
        return undefined;
    }
    return evaluation.primitiveValue(expression);
}

function createBindingEvaluator(resolveModule: RuntimeModuleResolver): BindingEvaluator {
    const values = new Map<TypeScriptMorphNode, EvaluatedValue | undefined>();
    const evaluations = new Map<SourceFile, SourceEvaluation>();
    return function (declaration) {
        if (values.has(declaration)) {
            return values.get(declaration);
        }
        const source = declaration.getSourceFile();
        const evaluation = evaluations.get(source) ?? createSourceEvaluation(source);
        evaluations.set(source, evaluation);
        const value = bindingValue(declaration, resolveModule, evaluation);
        values.set(declaration, value);
        return value;
    };
}

function exportedValue(
    source: SourceFile,
    name: string,
    graph: PreparedModuleGraph,
    evaluate: BindingEvaluator
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
    source: SourceFile,
    graph: PreparedModuleGraph,
    evaluate: BindingEvaluator
): ReadonlyMap<string, ModuleValue> {
    if (graph.index.models.get(source)?.closed !== true || hasDynamicScope(source)) {
        return new Map();
    }
    return new Map(
        Array.from(graph.index.candidates(source)).flatMap(function (name) {
            const value = exportedValue(source, name, graph, evaluate);
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
    const evaluate = createBindingEvaluator(resolveModule);
    return {
        resolveModule,
        modules: new Map(files.map(function (file) {
            const source = file.sourceFile;
            return [ source, {
                initialized: graph.index.models.get(source)?.closed === true &&
                    moduleDependenciesInitialize(source, resolveModule),
                exports: exportValues(source, graph, evaluate)
            } ];
        }))
    };
}
