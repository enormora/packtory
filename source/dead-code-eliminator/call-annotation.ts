import type { Expression } from 'ts-morph';

export function hasPureCallAnnotation(expression: Expression): boolean {
    const leadingTrivia = expression.getSourceFile().getFullText().slice(expression.getPos(), expression.getStart());
    return /[@#]__PURE__/u.test(leadingTrivia);
}
