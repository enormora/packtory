import type { SourceFile } from 'ts-morph';
import type { BindingDescriptor } from '../reachability/binding-extractor.ts';
import type { PreparedModuleGraph } from '../exports/prepared-module-graph.ts';
import { resolveNamespaceExport } from '../exports/namespace-export-value.ts';
import type { ModuleBindingEvaluator } from './module-binding-evaluation.ts';
import { moduleCallable } from './module-callable.ts';
import type { EvaluatedValue } from './primitive-value.ts';

type ConstantModuleValue = { readonly kind: 'constant'; readonly value: EvaluatedValue; };
type NamespaceModuleValue = { readonly kind: 'namespace'; readonly source: SourceFile; };
type CallableModuleValue = { readonly kind: 'callable'; readonly source: SourceFile; readonly name: string; };
export type ModuleValue = CallableModuleValue | ConstantModuleValue | NamespaceModuleValue;

function bindingModuleValue(
    binding: BindingDescriptor | undefined,
    evaluate: ModuleBindingEvaluator
): ModuleValue | undefined {
    if (binding === undefined) {
        return undefined;
    }
    const value = evaluate(binding.declarationNode);
    if (value !== undefined) {
        return { kind: 'constant', value };
    }
    const target = moduleCallable(binding.declarationNode);
    return target === undefined
        ? undefined
        : { kind: 'callable', source: target.getSourceFile(), name: binding.name };
}

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
    return bindingModuleValue(graph.index.binding(source, name), evaluate);
}
