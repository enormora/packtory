import {
    Node as TypeScriptMorphNode,
    type Expression,
    type Node as TypeScriptMorphNodeType,
    type SourceFile
} from 'ts-morph';
import type { SourceTextEdit } from '../../source-transformation/text-edits.ts';
import type { SourcePreparation } from '../../source-transformation/source-preparation.ts';
import { createSourceEvaluation } from '../evaluation/constant-evaluation.ts';
import type { EvaluatedValue } from '../evaluation/primitive-value.ts';
import { createPureCallResolver, type PureCallResolver } from '../evaluation/pure-local-call.ts';
import { expressionIsWriteTarget } from './expression-write.ts';
import { primitiveSource } from './primitive-source.ts';
import { sourceReplacement } from './source-replacement.ts';

function editForExpression(
    expression: Expression,
    evaluate: (expression: Expression) => EvaluatedValue | undefined
): SourceTextEdit | undefined {
    const result = evaluate(expression);
    if (result === undefined) {
        return undefined;
    }
    const content = primitiveSource(result);
    return expression.getText() === content
        ? undefined
        : { start: expression.getStart(), end: expression.getEnd(), content: `(${content})` };
}

function identityExpressionEdits(expression: Expression, resolveCall: PureCallResolver): readonly SourceTextEdit[] {
    const returned = TypeScriptMorphNode.isCallExpression(expression)
        ? resolveCall(expression)?.returnedArgument
        : undefined;
    return returned === undefined ? [] : sourceReplacement(expression, [ '(0, ', returned, ')' ]);
}

function isSpecializableExpression(node: TypeScriptMorphNodeType): node is Expression {
    return TypeScriptMorphNode.isCallExpression(node) || TypeScriptMorphNode.isPropertyAccessExpression(node) ||
        TypeScriptMorphNode.isElementAccessExpression(node) || TypeScriptMorphNode.isBinaryExpression(node) ||
        TypeScriptMorphNode.isPrefixUnaryExpression(node) || TypeScriptMorphNode.isTypeOfExpression(node);
}

function expressionSpecializationEdits(sourceFile: SourceFile): readonly SourceTextEdit[] {
    let previousEnd = 0;
    const evaluate = createSourceEvaluation(sourceFile).primitiveValue;
    const resolveCall = createPureCallResolver(sourceFile);
    return sourceFile.getDescendants().filter(isSpecializableExpression).flatMap(function (expression) {
        if (expression.getStart() < previousEnd || expressionIsWriteTarget(expression)) {
            return [];
        }
        const edit = editForExpression(expression, evaluate);
        const edits = edit === undefined
            ? identityExpressionEdits(expression, resolveCall)
            : [ edit ];
        if (edits.length === 0) {
            return [];
        }
        previousEnd = expression.getEnd();
        return edits;
    });
}

export function specializeExpressions(preparation: SourcePreparation): void {
    preparation.applyEdits(expressionSpecializationEdits(preparation.sourceFile));
}
