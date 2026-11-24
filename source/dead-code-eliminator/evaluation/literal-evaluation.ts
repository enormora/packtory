import { match } from 'ts-pattern';
import { constant } from 'remeda';
import { Node as TypeScriptMorphNode, type ClassExpression, type Expression } from 'ts-morph';
import { hasClassImpurity } from '../class-purity.ts';
import type { EvaluationContext } from './evaluation-context.ts';
import { evaluated, numericLiteralValue, type EvaluatedValue } from './primitive-value.ts';
import { opaqueResult, type AbstractValue } from './abstract-value.ts';
import { evaluateTemplate } from './template-evaluation.ts';
import { evaluateComputedKey } from './property-key-evaluation.ts';

function isOpaqueValueLiteral(expression: Expression): boolean {
    return TypeScriptMorphNode.isRegularExpressionLiteral(expression) ||
        TypeScriptMorphNode.isFunctionExpression(expression) || TypeScriptMorphNode.isArrowFunction(expression);
}

function literalValue(expression: Expression): EvaluatedValue | undefined {
    return match(expression)
        .when(TypeScriptMorphNode.isBigIntLiteral, function (literal) {
            return evaluated(BigInt(literal.compilerNode.text.slice(0, -1)));
        })
        .when(TypeScriptMorphNode.isNumericLiteral, function (literal) {
            return evaluated(numericLiteralValue(literal));
        })
        .when(TypeScriptMorphNode.isStringLiteral, function (literal) {
            return evaluated(literal.getLiteralValue());
        })
        .when(TypeScriptMorphNode.isNoSubstitutionTemplateLiteral, function (literal) {
            return evaluated(literal.getLiteralValue());
        })
        .when(TypeScriptMorphNode.isTrueLiteral, function () {
            return evaluated(true);
        })
        .when(TypeScriptMorphNode.isFalseLiteral, function () {
            return evaluated(false);
        })
        .when(TypeScriptMorphNode.isNullLiteral, function () {
            return evaluated(null);
        })
        .otherwise(constant(undefined));
}

function classExpressionValue(expression: ClassExpression, context: EvaluationContext): AbstractValue | undefined {
    const impure = hasClassImpurity(
        expression,
        function (candidate) {
            return context.evaluate(candidate, context) !== undefined;
        },
        function (key) {
            return evaluateComputedKey(key, context);
        }
    );
    return impure ? undefined : opaqueResult('value');
}

export function evaluateLiteral(expression: Expression, context: EvaluationContext): AbstractValue | undefined {
    if (TypeScriptMorphNode.isTemplateExpression(expression)) {
        return evaluateTemplate(expression, context);
    }
    if (TypeScriptMorphNode.isClassExpression(expression)) {
        return classExpressionValue(expression, context);
    }
    return isOpaqueValueLiteral(expression) ? opaqueResult('value') : literalValue(expression);
}
