import type { Node as TypeScriptMorphNode, Identifier, SourceFile } from 'ts-morph';
import { createSourceEvaluation, type PrimitiveEvaluator } from '../evaluation/constant-evaluation.ts';
import { referenceTarget } from '../reference-target.ts';
import type { ExportTargetResolver } from './module-export-resolver.ts';
import { collectNamespaceConsumers } from './namespace-consumers.ts';
import { namespaceConsumerDemand } from './namespace-consumer-demand.ts';
import { namespaceBindingDemand, type NamespaceBindingContext } from './namespace-binding-demand.ts';
import { namespaceExpressionDemand, type NamespaceExpressionContext } from './namespace-expression-demand.ts';
import { createNamespaceDemandSolver } from './namespace-demand-solver.ts';
import {
    allNamespaceProperties,
    mergeNamespaceDemand,
    namespaceProperties,
    noNamespaceProperties,
    type NamespaceDemand
} from './namespace-demand.ts';

type ExportDemandKey = { readonly source: SourceFile; readonly name: string; };
export type NamespaceDemandPolicy = Pick<NamespaceExpressionContext, 'receiverIsUnobserved'> & {
    readonly isObserved: NamespaceBindingContext['isObserved'];
};
export type NamespaceDemandAnalysis = {
    readonly properties: (declaration: TypeScriptMorphNode) => ReadonlySet<string> | undefined;
    readonly exportProperties: (source: SourceFile, name: string) => ReadonlySet<string> | undefined;
};

const maximumDemandQueries = 2048;
const maximumDemandEvaluations = 32_768;

export function createNamespaceDemandAnalysis(
    files: readonly SourceFile[],
    publicFiles: ReadonlySet<SourceFile>,
    resolveModule: ExportTargetResolver,
    policy: NamespaceDemandPolicy
): NamespaceDemandAnalysis {
    const solver = createNamespaceDemandSolver<ExportDemandKey | TypeScriptMorphNode>({
        maximumQueries: maximumDemandQueries,
        maximumEvaluations: maximumDemandEvaluations
    });
    const state = {
        analyzedFiles: new Set(files),
        incoming: collectNamespaceConsumers(files, resolveModule),
        exportedKeys: new Map<SourceFile, Map<string, ExportDemandKey>>(),
        references: new Map<Identifier, readonly (TypeScriptMorphNode | undefined)[]>(),
        evaluations: new Map<SourceFile, PrimitiveEvaluator>()
    };

    function exportKey(source: SourceFile, name: string): ExportDemandKey {
        let keys = state.exportedKeys.get(source);
        if (keys === undefined) {
            keys = new Map();
            state.exportedKeys.set(source, keys);
        }
        let key = keys.get(name);
        if (key === undefined) {
            key = { source, name };
            keys.set(name, key);
        }
        return key;
    }

    function exportedDemand(key: ExportDemandKey, observers: NamespaceExpressionContext): NamespaceDemand {
        if (!state.analyzedFiles.has(key.source) || publicFiles.has(key.source) || state.incoming.unknownDynamic) {
            return allNamespaceProperties;
        }
        const consumers = state.incoming.consumers.get(key.source) ?? [];
        return consumers.reduce<NamespaceDemand>(function (demand, consumer) {
            return mergeNamespaceDemand(demand, namespaceConsumerDemand(consumer, key.name, observers));
        }, noNamespaceProperties);
    }

    const context: NamespaceBindingContext & NamespaceExpressionContext = {
        ...policy,
        analyzedFiles: state.analyzedFiles,
        binding(declaration) {
            return solver.read(declaration, function () {
                return namespaceBindingDemand(declaration, context);
            });
        },
        expression(expression) {
            return solver.read(expression, function () {
                return namespaceExpressionDemand(expression, context);
            });
        },
        exported(source, name) {
            const key = exportKey(source, name);
            return solver.read(key, function () {
                return exportedDemand(key, context);
            });
        },
        primitive(expression) {
            const source = expression.getSourceFile();
            let evaluate = state.evaluations.get(source);
            if (evaluate === undefined) {
                evaluate = createSourceEvaluation(source).primitiveValue;
                state.evaluations.set(source, evaluate);
            }
            return evaluate(expression);
        },
        references(name) {
            let references = state.references.get(name);
            if (references === undefined) {
                references = name
                    .findReferences()
                    .flatMap(function (group) {
                        return group.getReferences().map(referenceTarget);
                    })
                    .filter(function (reference) {
                        return reference !== name;
                    });
                state.references.set(name, references);
            }
            return references;
        }
    };

    return {
        properties(declaration) {
            return namespaceProperties(solver.resolve(declaration, function () {
                return namespaceBindingDemand(declaration, context);
            }));
        },
        exportProperties(source, name) {
            const key = exportKey(source, name);
            return namespaceProperties(solver.resolve(key, function () {
                return exportedDemand(key, context);
            }));
        }
    };
}
