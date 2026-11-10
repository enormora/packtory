import { Node as TypeScriptMorphNode, SyntaxKind, type Expression } from 'ts-morph';
import { expressionWithWrappers, unwrapExpression } from '../expression-unwrapping.ts';
import { expressionIsWriteTarget } from './expression-write.ts';

function parentReadsValue(parent: TypeScriptMorphNode): boolean {
    return [
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
    ]
        .includes(parent.getKind());
}

function parentUsesAsValue(parent: TypeScriptMorphNode, expression: Expression): boolean {
    if (TypeScriptMorphNode.isArgumented(parent)) {
        return parent.getArguments().includes(expression);
    }
    if (TypeScriptMorphNode.isInitializerExpressionGetable(parent)) {
        return parent.getInitializer() === expression;
    }
    if (TypeScriptMorphNode.isElementAccessExpression(parent)) {
        return parent.getArgumentExpression() === expression;
    }
    if (TypeScriptMorphNode.isForStatement(parent)) {
        return [ parent.getInitializer(), parent.getCondition(), parent.getIncrementor() ].includes(expression);
    }
    return false;
}

function valuePosition(expression: Expression): boolean {
    const parent = expression.getParentOrThrow();
    if (TypeScriptMorphNode.isArrowFunction(parent)) {
        return true;
    }
    const hasExpression = TypeScriptMorphNode.isExpressioned(parent) ||
        TypeScriptMorphNode.isLeftHandSideExpressioned(parent);
    return parentReadsValue(parent) ||
        hasExpression && parent.getExpression() === expression ||
        parentUsesAsValue(parent, expression);
}

function needsReference(expression: Expression): boolean {
    const parent = expressionWithWrappers(expression).getParentOrThrow();
    if (TypeScriptMorphNode.isDeleteExpression(parent)) {
        return true;
    }
    if (TypeScriptMorphNode.isCallExpression(parent) || TypeScriptMorphNode.isNewExpression(parent)) {
        return unwrapExpression(parent.getExpression()) === expression;
    }
    return TypeScriptMorphNode.isTaggedTemplateExpression(parent);
}

export function expressionIsValueRead(expression: Expression): boolean {
    return expression.getFirstAncestor(TypeScriptMorphNode.isTypeNode) === undefined &&
        valuePosition(expression) && !expressionIsWriteTarget(expression) && !needsReference(expression);
}
