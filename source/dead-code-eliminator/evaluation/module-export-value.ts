import type { SourceFile } from 'ts-morph';
import type { PreparedModuleGraph } from '../exports/prepared-module-graph.ts';
import { resolveNamespaceExport } from '../exports/namespace-export-value.ts';
import { isNamedDeclaration } from '../transform/named-declaration-kinds.ts';
import type { ModuleBindingEvaluator } from './module-binding-evaluation.ts';
import type { EvaluatedValue } from './primitive-value.ts';

type ConstantModuleValue = { readonly kind: 'constant'; readonly value: EvaluatedValue; };
type NamespaceModuleValue = { readonly kind: 'namespace'; readonly source: SourceFile; };
export type ModuleValue = ConstantModuleValue | NamespaceModuleValue;

function namespaceModuleValue(source: SourceFile, name: string, graph: PreparedModuleGraph): ModuleValue | undefined {
    const namespace = resolveNamespaceExport(source, name, graph.index.models, graph.resolveModule);
    return namespace === undefined ? undefined : { kind: 'namespace', source: namespace };
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
    const binding = graph.index.binding(source, name);
    const declaration = binding?.declarationNode;
    if (isNamedDeclaration(declaration)) {
        return undefined;
    }
    const value = binding === undefined ? undefined : evaluate(binding.declarationNode);
    if (value !== undefined) {
        return { kind: 'constant', value };
    }
    return namespaceModuleValue(source, name, graph);
}
