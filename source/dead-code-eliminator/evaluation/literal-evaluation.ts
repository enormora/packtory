import { match } from 'ts-pattern';
import { constant } from 'remeda';
import { Node as TypeScriptMorphNode, type Expression } from 'ts-morph';
import { evaluated, numericLiteralValue, type EvaluatedValue } from './primitive-value.ts';

export function evaluateLiteral(expression: Expression): EvaluatedValue | undefined {
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
