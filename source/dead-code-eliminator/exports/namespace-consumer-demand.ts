import { Node as TypeScriptMorphNode, type ExportDeclaration, type ImportDeclaration } from 'ts-morph';
import { match } from 'ts-pattern';
import { expressionWithWrappers } from '../expression-unwrapping.ts';
import type { NamespaceConsumer } from './namespace-consumers.ts';
import type { NamespaceExpressionContext } from './namespace-expression-demand.ts';
import {
    allNamespaceProperties,
    mergeNamespaceDemand,
    namespacePropertyDemand,
    noNamespaceProperties,
    type NamespaceDemand
} from './namespace-demand.ts';

type ConsumerContext = Pick<NamespaceExpressionContext, 'binding' | 'exported' | 'expression'>;

function importDemand(declaration: ImportDeclaration, name: string, context: ConsumerContext): NamespaceDemand {
    const clause = declaration.getImportClause();
    if (clause === undefined) {
        return noNamespaceProperties;
    }
    const initial = name === 'default' && clause.getDefaultImport() !== undefined
        ? context.binding(clause)
        : noNamespaceProperties;
    const named = declaration
        .getNamedImports()
        .filter(function (specifier) {
            return specifier.getNameNode().compilerNode.text === name;
        })
        .reduce<NamespaceDemand>(function (demand, specifier) {
            return mergeNamespaceDemand(demand, context.binding(specifier));
        }, initial);
    const namespace = clause.getNamespaceImport();
    return namespace === undefined
        ? named
        : mergeNamespaceDemand(named, namespacePropertyDemand(context.binding(namespace.getParent()), name));
}

function exportDemand(declaration: ExportDeclaration, name: string, context: ConsumerContext): NamespaceDemand {
    const namespace = declaration.getNamespaceExport();
    if (namespace !== undefined) {
        return namespacePropertyDemand(context.exported(declaration.getSourceFile(), namespace.getName()), name);
    }
    if (declaration.isNamespaceExport()) {
        return name === 'default' ? noNamespaceProperties : context.exported(declaration.getSourceFile(), name);
    }
    return declaration
        .getNamedExports()
        .filter(function (specifier) {
            return specifier.getNameNode().compilerNode.text === name;
        })
        .reduce<NamespaceDemand>(function (demand, specifier) {
            const exportedName = (specifier.getAliasNode() ?? specifier.getNameNode()).compilerNode.text;
            return mergeNamespaceDemand(demand, context.exported(declaration.getSourceFile(), exportedName));
        }, noNamespaceProperties);
}

export function namespaceConsumerDemand(
    consumer: NamespaceConsumer,
    name: string,
    context: ConsumerContext
): NamespaceDemand {
    return match(consumer)
        .with({ type: 'import' }, function (edge) {
            return importDemand(edge.declaration, name, context);
        })
        .with({ type: 'export' }, function (edge) {
            return exportDemand(edge.declaration, name, context);
        })
        .with({ type: 'dynamic' }, function (edge) {
            const parent = expressionWithWrappers(edge.call).getParent();
            return TypeScriptMorphNode.isAwaitExpression(parent)
                ? namespacePropertyDemand(context.expression(parent), name)
                : allNamespaceProperties;
        })
        .exhaustive();
}
