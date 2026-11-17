import {
    Node as TypeScriptMorphNode,
    type ElementAccessExpression,
    type Expression,
    type Identifier,
    type PropertyAccessExpression
} from 'ts-morph';
import {
    resolveImportedExpressionPropertyPath,
    type ImportedExpressionOrigin
} from '../imported-expression-origin.ts';
import { unwrapExpression } from '../expression-unwrapping.ts';
import { constantDominatesRead } from './constant-binding.ts';
import { declarationOf, maximumEvaluationDepth } from './evaluation-context.ts';
import type { PrimitiveEvaluator } from './constant-evaluation.ts';

type FollowOrigin = (expression: Expression, depth: number) => ImportedExpressionOrigin | undefined;

function aliasOrigin(value: Identifier, depth: number, follow: FollowOrigin): ImportedExpressionOrigin | undefined {
    const binding = declarationOf(value);
    if (
        !TypeScriptMorphNode.isVariableDeclaration(binding) ||
        !binding.hasInitializer() || !constantDominatesRead(binding, value)
    ) {
        return undefined;
    }
    return follow(binding.getInitializerOrThrow(), depth + 1);
}

function propertyOrigin(
    value: PropertyAccessExpression,
    depth: number,
    follow: FollowOrigin
): ImportedExpressionOrigin | undefined {
    const base = follow(value.getExpression(), depth + 1);
    return base === undefined ? undefined : { from: base.from, path: [ ...base.path, value.getName() ] };
}

function elementOrigin(
    value: ElementAccessExpression,
    depth: number,
    follow: FollowOrigin,
    evaluate: PrimitiveEvaluator
): ImportedExpressionOrigin | undefined {
    const known = evaluate(value.getArgumentExpressionOrThrow());
    const base = follow(value.getExpression(), depth + 1);
    return known === undefined || base === undefined
        ? undefined
        : { from: base.from, path: [ ...base.path, String(known.value) ] };
}

function projectedOrigin(
    expression: Expression,
    depth: number,
    follow: FollowOrigin,
    evaluate: PrimitiveEvaluator
): ImportedExpressionOrigin | undefined {
    const value = unwrapExpression(expression);
    if (TypeScriptMorphNode.isIdentifier(value)) {
        return aliasOrigin(value, depth, follow);
    }
    if (TypeScriptMorphNode.isPropertyAccessExpression(value)) {
        return propertyOrigin(value, depth, follow);
    }
    return TypeScriptMorphNode.isElementAccessExpression(value)
        ? elementOrigin(value, depth, follow, evaluate)
        : undefined;
}

export function createInitializedImportOrigin(
    evaluate: PrimitiveEvaluator
): (expression: Expression) => ImportedExpressionOrigin | undefined {
    const follow: FollowOrigin = function resolve(expression, depth) {
        if (depth >= maximumEvaluationDepth) {
            return undefined;
        }
        return resolveImportedExpressionPropertyPath(expression) ??
            projectedOrigin(expression, depth, resolve, evaluate);
    };
    return function (expression) {
        return follow(expression, 0);
    };
}
