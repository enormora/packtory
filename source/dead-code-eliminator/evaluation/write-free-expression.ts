import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    type Expression,
    type Node as TypeScriptMorphNodeType
} from 'ts-morph';

function writesState(node: TypeScriptMorphNodeType): boolean {
    if (TypeScriptMorphNode.isBinaryExpression(node)) {
        const operator = node.getOperatorToken().getKind();
        return operator >= SyntaxKind.FirstAssignment && operator <= SyntaxKind.LastAssignment;
    }
    if (TypeScriptMorphNode.isPrefixUnaryExpression(node) || TypeScriptMorphNode.isPostfixUnaryExpression(node)) {
        return [ SyntaxKind.PlusPlusToken, SyntaxKind.MinusMinusToken ].includes(node.getOperatorToken());
    }
    return TypeScriptMorphNode.isDeleteExpression(node);
}

export function expressionIsWriteFree(expression: Expression): boolean {
    return !writesState(expression) && !expression.getDescendants().some(writesState);
}
