import { Node as TsMorphNode, type Expression } from 'ts-morph';

function nextUnwrappedExpression(expression: Expression): Expression | undefined {
    if (TsMorphNode.isAsExpression(expression) || TsMorphNode.isSatisfiesExpression(expression)) {
        return expression.getExpression();
    }
    if (
        TsMorphNode.isParenthesizedExpression(expression) ||
        TsMorphNode.isTypeAssertion(expression) ||
        TsMorphNode.isNonNullExpression(expression)
    ) {
        return expression.getExpression();
    }
    return undefined;
}

export function unwrapExpression(expression: Expression): Expression {
    const nextExpression = nextUnwrappedExpression(expression);
    return nextExpression === undefined ? expression : unwrapExpression(nextExpression);
}
