import { Node as TypeScriptMorphNode, type Expression } from 'ts-morph';

function nextUnwrappedExpression(expression: TypeScriptMorphNode | undefined): Expression | undefined {
    if (TypeScriptMorphNode.isAsExpression(expression) || TypeScriptMorphNode.isSatisfiesExpression(expression)) {
        return expression.getExpression();
    }
    if (
        TypeScriptMorphNode.isParenthesizedExpression(expression) ||
        TypeScriptMorphNode.isTypeAssertion(expression) ||
        TypeScriptMorphNode.isNonNullExpression(expression)
    ) {
        return expression.getExpression();
    }
    return undefined;
}

export function unwrapExpression(expression: Expression): Expression;
export function unwrapExpression(expression: Expression | undefined): Expression | undefined;
export function unwrapExpression(expression: Expression | undefined): Expression | undefined {
    const nextExpression = nextUnwrappedExpression(expression);
    return nextExpression === undefined ? expression : unwrapExpression(nextExpression);
}

function wrapsExpression(parent: TypeScriptMorphNode, expression: TypeScriptMorphNode): parent is Expression {
    const unwrapped: TypeScriptMorphNode | undefined = nextUnwrappedExpression(parent);
    return unwrapped === expression;
}

export function expressionWithWrappers(expression: Expression): Expression;
export function expressionWithWrappers(node: TypeScriptMorphNode): TypeScriptMorphNode;
export function expressionWithWrappers(expression: TypeScriptMorphNode): TypeScriptMorphNode {
    return expression.getAncestors().reduce<TypeScriptMorphNode>(function (current, parent) {
        return wrapsExpression(parent, current)
            ? parent
            : current;
    }, expression);
}
