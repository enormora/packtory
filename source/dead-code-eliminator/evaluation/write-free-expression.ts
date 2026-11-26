import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    type Expression,
    type Node as TypeScriptMorphNodeType
} from 'ts-morph';
import { isAssignmentOperator } from '../assignment-operator.ts';

function writesState(node: TypeScriptMorphNodeType): boolean {
    if (TypeScriptMorphNode.isBinaryExpression(node)) {
        return isAssignmentOperator(node.getOperatorToken().getKind());
    }
    if (TypeScriptMorphNode.isPrefixUnaryExpression(node) || TypeScriptMorphNode.isPostfixUnaryExpression(node)) {
        return [ SyntaxKind.PlusPlusToken, SyntaxKind.MinusMinusToken ].includes(node.getOperatorToken());
    }
    return TypeScriptMorphNode.isDeleteExpression(node);
}

export function expressionIsWriteFree(expression: Expression): boolean {
    return !writesState(expression) && !expression.getDescendants().some(writesState);
}
