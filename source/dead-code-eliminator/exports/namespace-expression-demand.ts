import {
    Node as TypeScriptMorphNode,
    type ElementAccessExpression,
    type PropertyAccessExpression,
    type Expression,
    type SourceFile
} from 'ts-morph';
import { callObservesReceiver } from '../receiver-call.ts';
import { constantStatement } from '../evaluation/constant-binding.ts';
import type { PrimitiveEvaluator } from '../evaluation/constant-evaluation.ts';
import { declarationOf } from '../evaluation/evaluation-context.ts';
import type { EvaluatedValue } from '../evaluation/primitive-value.ts';
import { expressionWithWrappers } from '../expression-unwrapping.ts';
import {
    allNamespaceProperties,
    namespaceMemberDemand,
    mergeNamespaceDemand,
    noNamespaceProperties,
    type NamespaceDemand
} from './namespace-demand.ts';

export type NamespaceExpressionContext = {
    readonly binding: (declaration: TypeScriptMorphNode) => NamespaceDemand;
    readonly expression: (expression: TypeScriptMorphNode) => NamespaceDemand;
    readonly exported: (source: SourceFile, name: string) => NamespaceDemand;
    readonly primitive: PrimitiveEvaluator;
    readonly receiverDemand: (receiver: Expression, name: string) => NamespaceDemand;
};

function memberDemand(
    access: ElementAccessExpression | PropertyAccessExpression,
    name: string,
    context: NamespaceExpressionContext
): NamespaceDemand {
    const value = namespaceMemberDemand(name, context.expression(access));
    return callObservesReceiver(access)
        ? mergeNamespaceDemand(value, context.receiverDemand(access.getExpression(), name))
        : value;
}

function computedKeyValue(key: Expression, primitive: PrimitiveEvaluator): EvaluatedValue | undefined {
    const value = primitive(key);
    if (value !== undefined || !TypeScriptMorphNode.isIdentifier(key)) {
        return value;
    }
    const declaration = declarationOf(key);
    if (!TypeScriptMorphNode.isVariableDeclaration(declaration) || constantStatement(declaration) === undefined) {
        return undefined;
    }
    const initializer = declaration.getInitializer();
    return initializer === undefined ? undefined : primitive(initializer);
}

function elementDemand(element: ElementAccessExpression, context: NamespaceExpressionContext): NamespaceDemand {
    const key = element.getArgumentExpressionOrThrow();
    const value = computedKeyValue(key, context.primitive);
    return value === undefined
        ? allNamespaceProperties
        : memberDemand(element, String(value.value), context);
}

function accessDemand(
    expression: Expression,
    parent: TypeScriptMorphNode | undefined,
    context: NamespaceExpressionContext
): NamespaceDemand | undefined {
    if (TypeScriptMorphNode.isPropertyAccessExpression(parent) && parent.getExpression() === expression) {
        return memberDemand(parent, parent.getNameNode().compilerNode.text, context);
    }
    if (TypeScriptMorphNode.isElementAccessExpression(parent) && parent.getExpression() === expression) {
        return elementDemand(parent, context);
    }
    return undefined;
}

function moduleDemand(
    parent: TypeScriptMorphNode | undefined,
    context: NamespaceExpressionContext
): NamespaceDemand | undefined {
    if (TypeScriptMorphNode.isExportAssignment(parent)) {
        return context.exported(parent.getSourceFile(), 'default');
    }
    if (TypeScriptMorphNode.isExportSpecifier(parent)) {
        const name = (parent.getAliasNode() ?? parent.getNameNode()).compilerNode.text;
        return context.exported(parent.getSourceFile(), name);
    }
    return TypeScriptMorphNode.isNamespaceExport(parent)
        ? context.exported(parent.getSourceFile(), parent.getName())
        : undefined;
}

function observedDemand(expression: Expression, context: NamespaceExpressionContext): NamespaceDemand {
    const parent = expression.getParent();
    const transferred = accessDemand(expression, parent, context) ?? moduleDemand(parent, context);
    if (transferred !== undefined) {
        return transferred;
    }
    if (TypeScriptMorphNode.isVariableDeclaration(parent) && parent.getInitializer() === expression) {
        return context.binding(parent);
    }
    return TypeScriptMorphNode.isExpressionStatement(parent) ? noNamespaceProperties : allNamespaceProperties;
}

export function namespaceExpressionDemand(
    original: TypeScriptMorphNode,
    context: NamespaceExpressionContext
): NamespaceDemand {
    return TypeScriptMorphNode.isExpression(original)
        ? observedDemand(expressionWithWrappers(original), context)
        : allNamespaceProperties;
}
