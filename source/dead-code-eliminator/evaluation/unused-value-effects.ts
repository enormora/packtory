import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    type Expression,
    type SourceFile,
    type NewExpression
} from 'ts-morph';
import { match } from 'ts-pattern';
import { unwrapExpression } from '../expression-unwrapping.ts';
import { returnCreationIsPure } from '../liveness/builder-return.ts';
import { hasClassImpurity, type ClassPropertyKeyResolver } from '../class-purity.ts';
import type { ExpressionPurityChecker } from '../imported-expression-origin.ts';
import { createSourceEvaluation } from './constant-evaluation.ts';
import { createPureCallResolver } from './pure-local-call.ts';
import { resolveLocalConstruction } from './construction-target.ts';

export type UnusedValueResolver = (expression: Expression) => readonly Expression[] | undefined;

function unusedSequenceEffects(
    expression: Expression,
    resolveUnused: UnusedValueResolver
): readonly Expression[] | undefined {
    if (
        !TypeScriptMorphNode.isBinaryExpression(expression) ||
        expression.getOperatorToken().getKind() !== SyntaxKind.CommaToken
    ) {
        return undefined;
    }
    const left = expression.getLeft();
    const right = expression.getRight();
    return [ ...resolveUnused(left) ?? [ left ], ...resolveUnused(right) ?? [ right ] ];
}

function unusedConstructionEffects(
    expression: NewExpression,
    isPure: ExpressionPurityChecker,
    propertyKeyFor: ClassPropertyKeyResolver
): readonly Expression[] | undefined {
    const construction = resolveLocalConstruction(expression);
    if (construction === undefined) {
        return undefined;
    }
    const { definition } = construction;
    return [
        ...definition !== undefined && hasClassImpurity(definition, isPure, propertyKeyFor) ? [ definition ] : [],
        ...construction.arguments
    ];
}

export function createUnusedValueResolver(sourceFile: SourceFile): UnusedValueResolver {
    const evaluation = createSourceEvaluation(sourceFile);
    const callEffects = createPureCallResolver(sourceFile);
    const propertyKeyFor: ClassPropertyKeyResolver = function (expression) {
        const value = evaluation.primitiveValue(expression);
        return value === undefined ? undefined : String(value.value);
    };
    return function resolveUnused(expression) {
        if (evaluation.canDiscard(expression) || returnCreationIsPure(expression, new Set())) {
            return [];
        }
        const node = unwrapExpression(expression);
        const sequence = unusedSequenceEffects(node, resolveUnused);
        if (sequence !== undefined) {
            return sequence;
        }
        return match(node)
            .when(TypeScriptMorphNode.isNewExpression, function (construction) {
                return unusedConstructionEffects(construction, evaluation.canDiscard, propertyKeyFor);
            })
            .when(TypeScriptMorphNode.isCallExpression, function (call) {
                return callEffects(call)?.arguments;
            })
            .otherwise(function () {
                return undefined;
            });
    };
}
