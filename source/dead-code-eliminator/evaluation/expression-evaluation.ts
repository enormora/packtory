import { match } from 'ts-pattern';
import { Node as TypeScriptMorphNode, type Expression, type Node as TypeScriptMorphNodeType } from 'ts-morph';
import { unwrapExpression } from '../expression-unwrapping.ts';
import type { EvaluationContext } from './evaluation-context.ts';
import type { AbstractValue } from './abstract-value.ts';
import { evaluateArray } from './array-evaluation.ts';
import { evaluateIdentifier } from './identifier-evaluation.ts';
import { evaluateRecordExpression } from './record-evaluation.ts';
import { evaluateLiteral } from './literal-evaluation.ts';
import { evaluateBinary, evaluateConditional, evaluateKeywordUnary, evaluateUnary } from './operator-evaluation.ts';

function expressionValue(node: Expression, context: EvaluationContext): AbstractValue | undefined {
    return match(node)
        .when(TypeScriptMorphNode.isIdentifier, function (identifier) {
            return evaluateIdentifier(identifier, context);
        })
        .when(TypeScriptMorphNode.isBinaryExpression, function (binary) {
            return evaluateBinary(binary, context);
        })
        .when(TypeScriptMorphNode.isPrefixUnaryExpression, function (unary) {
            return evaluateUnary(unary, context);
        })
        .when(TypeScriptMorphNode.isPostfixUnaryExpression, function (unary) {
            return evaluateUnary(unary, context);
        })
        .when(TypeScriptMorphNode.isCallExpression, function (call) {
            return context.call(call, context);
        })
        .when(TypeScriptMorphNode.isConditionalExpression, function (conditional) {
            return evaluateConditional(conditional, context);
        })
        .when(TypeScriptMorphNode.isVoidExpression, function (unary) {
            return evaluateKeywordUnary(unary, context);
        })
        .when(TypeScriptMorphNode.isTypeOfExpression, function (unary) {
            return evaluateKeywordUnary(unary, context);
        })
        .when(TypeScriptMorphNode.isArrayLiteralExpression, function (array) {
            return evaluateArray(array, context);
        })
        .otherwise(function () {
            return evaluateLiteral(node, context) ?? evaluateRecordExpression(node, context);
        });
}

export function evaluateExpression(
    expression: TypeScriptMorphNodeType,
    context: EvaluationContext
): AbstractValue | undefined {
    return context.consume() && TypeScriptMorphNode.isExpression(expression)
        ? expressionValue(unwrapExpression(expression), context)
        : undefined;
}
