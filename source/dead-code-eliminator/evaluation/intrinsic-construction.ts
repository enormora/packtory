import {
    Node as TypeScriptMorphNode,
    type Expression,
    type NewExpression,
    type Node as TypeScriptMorphNodeType
} from 'ts-morph';
import { unwrapExpression } from '../expression-unwrapping.ts';
import { isOpaqueArrayResult, isPrimitiveResult, isRecordResult, type AbstractValue } from './abstract-value.ts';
import type { EvaluationContext } from './evaluation-context.ts';
import { globalPathOf, type GlobalPath } from './global-path.ts';
import { intrinsicIntegrityOf, type IntrinsicIntegrity } from './evaluation-environment.ts';
import { evaluateComputedKey } from './property-key-evaluation.ts';
import { trustedConstructionIsEffectFree } from './trusted-construction.ts';

type ConstructionArgument = {
    readonly expression: Expression;
    readonly value: AbstractValue;
};

type IntrinsicConstruction = {
    readonly intactPaths: readonly GlobalPath[];
    readonly acceptsArgument: (argument: ConstructionArgument, intrinsics: IntrinsicIntegrity) => boolean;
};

const arrayIteratorPath: GlobalPath = [ 'Array', 'prototype', '@@iterator' ];

function isNullish(argument: ConstructionArgument): boolean {
    return isPrimitiveResult(argument.value) && (argument.value.value === undefined || argument.value.value === null);
}

function isIterableArray(argument: ConstructionArgument, intrinsics: IntrinsicIntegrity): boolean {
    const isArray = isOpaqueArrayResult(argument.value) ||
        isRecordResult(argument.value) && TypeScriptMorphNode.isArrayLiteralExpression(argument.expression);
    return isArray && intrinsics.isIntact(arrayIteratorPath);
}

function acceptsNullishOrArray(argument: ConstructionArgument, intrinsics: IntrinsicIntegrity): boolean {
    return isNullish(argument) || isIterableArray(argument, intrinsics);
}

function acceptsNullishOrEntryLiterals(argument: ConstructionArgument, intrinsics: IntrinsicIntegrity): boolean {
    const { expression } = argument;
    const entriesAreLiterals = TypeScriptMorphNode.isArrayLiteralExpression(expression) &&
        expression.getElements().every(function (element) {
            return TypeScriptMorphNode.isArrayLiteralExpression(unwrapExpression(element));
        });
    return isNullish(argument) || entriesAreLiterals && isIterableArray(argument, intrinsics);
}

const intrinsicConstructions: ReadonlyMap<string, IntrinsicConstruction> = new Map([
    [ 'Set', { intactPaths: [ [ 'Set' ], [ 'Set', 'prototype', 'add' ] ], acceptsArgument: acceptsNullishOrArray } ],
    [ 'Map', {
        intactPaths: [ [ 'Map' ], [ 'Map', 'prototype', 'set' ] ],
        acceptsArgument: acceptsNullishOrEntryLiterals
    } ],
    [ 'WeakSet', { intactPaths: [ [ 'WeakSet' ] ], acceptsArgument: isNullish } ],
    [ 'WeakMap', { intactPaths: [ [ 'WeakMap' ] ], acceptsArgument: isNullish } ],
    [ 'TextEncoder', { intactPaths: [ [ 'TextEncoder' ] ], acceptsArgument: isNullish } ],
    [ 'TextDecoder', { intactPaths: [ [ 'TextDecoder' ] ], acceptsArgument: isNullish } ]
]);

function isPositionalArgument(argument: TypeScriptMorphNodeType): argument is Expression {
    return TypeScriptMorphNode.isExpression(argument) && !TypeScriptMorphNode.isSpreadElement(argument);
}

function constructionArguments(
    expression: NewExpression,
    context: EvaluationContext
): readonly ConstructionArgument[] | undefined {
    const evaluatedArguments: ConstructionArgument[] = [];
    for (const argument of expression.getArguments()) {
        if (!isPositionalArgument(argument)) {
            return undefined;
        }
        const value = context.evaluate(argument, context);
        if (value === undefined) {
            return undefined;
        }
        evaluatedArguments.push({ expression: unwrapExpression(argument), value });
    }
    return evaluatedArguments;
}

function intrinsicConstructionFor(
    expression: NewExpression,
    context: EvaluationContext
): IntrinsicConstruction | undefined {
    const path = globalPathOf(expression.getExpression(), function (key) {
        return evaluateComputedKey(key, context);
    });
    return path?.length === 1 ? intrinsicConstructions.get(path.join('.')) : undefined;
}

function intrinsicConstructionIsEffectFree(expression: NewExpression, context: EvaluationContext): boolean {
    const construction = intrinsicConstructionFor(expression, context);
    const intrinsics = intrinsicIntegrityOf(expression.getSourceFile());
    if (construction?.intactPaths.every(intrinsics.isIntact) !== true) {
        return false;
    }
    const evaluatedArguments = constructionArguments(expression, context);
    if (evaluatedArguments === undefined) {
        return false;
    }
    const [ firstArgument ] = evaluatedArguments;
    return firstArgument === undefined || construction.acceptsArgument(firstArgument, intrinsics);
}

export function nonLocalConstructionIsEffectFree(expression: NewExpression, context: EvaluationContext): boolean {
    return intrinsicConstructionIsEffectFree(expression, context) ||
        trustedConstructionIsEffectFree(expression, context);
}
