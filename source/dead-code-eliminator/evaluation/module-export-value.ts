import type { SourceFile } from 'ts-morph';
import type { PreparedModuleGraph } from '../exports/prepared-module-graph.ts';
import { resolveNamespaceExport } from '../exports/namespace-export-value.ts';
import type { ModuleBindingEvaluator } from './module-binding-evaluation.ts';
import type { EvaluatedValue } from './primitive-value.ts';

type ConstantModuleValue = { readonly kind: 'constant'; readonly value: EvaluatedValue; };
type NamespaceModuleValue = { readonly kind: 'namespace'; readonly source: SourceFile; };
export type ModuleValue = ConstantModuleValue | NamespaceModuleValue;

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
