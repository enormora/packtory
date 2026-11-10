import { Node as TypeScriptMorphNode, SyntaxKind, type Expression } from 'ts-morph';
import { unwrapExpression } from '../expression-unwrapping.ts';
import { expressionIsWriteTarget } from './expression-write.ts';

const wrappers: ReadonlySet<SyntaxKind> = new Set([
    SyntaxKind.ParenthesizedExpression,
    SyntaxKind.AsExpression,
    SyntaxKind.TypeAssertionExpression,
    SyntaxKind.SatisfiesExpression,
    SyntaxKind.NonNullExpression
]);

const valueParents: ReadonlySet<SyntaxKind> = new Set([
    SyntaxKind.BinaryExpression,
    SyntaxKind.ConditionalExpression,
    SyntaxKind.PrefixUnaryExpression,
    SyntaxKind.PostfixUnaryExpression,
    SyntaxKind.ParenthesizedExpression,
    SyntaxKind.ReturnStatement,
    SyntaxKind.ThrowStatement,
    SyntaxKind.ExpressionStatement,
    SyntaxKind.AwaitExpression,
    SyntaxKind.YieldExpression,
    SyntaxKind.VoidExpression,
    SyntaxKind.TypeOfExpression,
    SyntaxKind.SpreadElement,
    SyntaxKind.SpreadAssignment,
    SyntaxKind.ComputedPropertyName,
    SyntaxKind.ArrayLiteralExpression
]);

function valueOperands(parent: TypeScriptMorphNode): readonly (TypeScriptMorphNode | undefined)[] {
    if (TypeScriptMorphNode.isArgumented(parent)) {
        return parent.getArguments();
    }
    if (TypeScriptMorphNode.isInitializerExpressionGetable(parent)) {
        return [ parent.getInitializer() ];
    }
    if (TypeScriptMorphNode.isElementAccessExpression(parent)) {
        return [ parent.getArgumentExpression() ];
    }
    if (TypeScriptMorphNode.isForStatement(parent)) {
        return [ parent.getInitializer(), parent.getCondition(), parent.getIncrementor() ];
    }
    return [];
}

function valuePosition(expression: Expression): boolean {
    const parent = expression.getParentOrThrow();
    if (TypeScriptMorphNode.isArrowFunction(parent)) {
        return parent.getBody() === expression;
    }
    const hasExpression = TypeScriptMorphNode.isExpressioned(parent) ||
        TypeScriptMorphNode.isLeftHandSideExpressioned(parent);
    return valueParents.has(parent.getKind()) ||
        hasExpression && parent.getExpression() === expression ||
        valueOperands(parent).includes(expression);
}

function referenceParent(expression: Expression): TypeScriptMorphNode {
    let parent = expression.getParentOrThrow();
    while (wrappers.has(parent.getKind())) {
        parent = parent.getParentOrThrow();
    }
    return parent;
}

function needsReference(expression: Expression): boolean {
    const parent = referenceParent(expression);
    if (TypeScriptMorphNode.isDeleteExpression(parent)) {
        return true;
    }
    if (TypeScriptMorphNode.isCallExpression(parent) || TypeScriptMorphNode.isNewExpression(parent)) {
        return unwrapExpression(parent.getExpression()) === expression;
    }
    return TypeScriptMorphNode.isTaggedTemplateExpression(parent) && unwrapExpression(parent.getTag()) === expression;
}

export function expressionIsValueRead(expression: Expression): boolean {
    return expression.getFirstAncestor(TypeScriptMorphNode.isTypeNode) === undefined &&
        valuePosition(expression) && !expressionIsWriteTarget(expression) && !needsReference(expression);
}
