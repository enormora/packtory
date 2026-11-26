import {
    Node as TypeScriptMorphNode,
    type NewExpression,
    type Node as TypeScriptMorphNodeType
} from 'ts-morph';
import { unwrapExpression } from '../expression-unwrapping.ts';
import { isOpaqueArrayResult, isPrimitiveResult, isRecordResult, type AbstractValue } from './abstract-value.ts';
import type { EvaluationContext } from './evaluation-context.ts';
import { annotatedConstructionIsEffectFree } from './annotated-construction.ts';
import { globalPathOf, type GlobalPath } from './global-path.ts';
import { intrinsicIntegrityOf, type IntrinsicIntegrity } from './evaluation-environment.ts';
import { evaluateComputedKey } from './property-key-evaluation.ts';

type ConstructionArgument = {
    readonly expression: TypeScriptMorphNodeType;
    readonly value: AbstractValue;
};

type IntrinsicConstruction = {
    readonly intactPath: GlobalPath;
    readonly acceptsArgument: (argument: ConstructionArgument, intrinsics: IntrinsicIntegrity) => boolean;
};

function isNullish(argument: ConstructionArgument): boolean {
    return isPrimitiveResult(argument.value) && (argument.value.value === undefined || argument.value.value === null);
}

function isIterableArray(argument: ConstructionArgument, intrinsics: IntrinsicIntegrity): boolean {
    const isArray = isOpaqueArrayResult(argument.value) ||
        isRecordResult(argument.value) && TypeScriptMorphNode.isArrayLiteralExpression(argument.expression);
    return isArray && intrinsics.isIntact([ 'Array', 'prototype', '@@iterator' ]);
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

function intrinsicConstructionTable(): ReadonlyMap<string, IntrinsicConstruction> {
    return new Map([
        [ 'Set', {
            intactPath: [ 'Set', 'prototype', 'add' ],
            acceptsArgument: acceptsNullishOrArray
        } ],
        [ 'Map', {
            intactPath: [ 'Map', 'prototype', 'set' ],
            acceptsArgument: acceptsNullishOrEntryLiterals
        } ],
        [ 'WeakSet', { intactPath: [ 'WeakSet' ], acceptsArgument: isNullish } ],
        [ 'WeakMap', { intactPath: [ 'WeakMap' ], acceptsArgument: isNullish } ],
        [ 'TextEncoder', { intactPath: [ 'TextEncoder' ], acceptsArgument: isNullish } ],
        [ 'TextDecoder', { intactPath: [ 'TextDecoder' ], acceptsArgument: isNullish } ]
    ]);
}

function constructionArguments(
    expression: NewExpression,
    context: EvaluationContext
): readonly ConstructionArgument[] | undefined {
    const evaluatedArguments: ConstructionArgument[] = [];
    for (const argument of expression.getArguments()) {
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
    return path === undefined ? undefined : intrinsicConstructionTable().get(path.join('.'));
}

function intrinsicConstructionIsEffectFree(expression: NewExpression, context: EvaluationContext): boolean {
    const construction = intrinsicConstructionFor(expression, context);
    const intrinsics = intrinsicIntegrityOf(expression.getSourceFile());
    if (construction === undefined || !intrinsics.isIntact(construction.intactPath)) {
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
        annotatedConstructionIsEffectFree(expression, context);
}
