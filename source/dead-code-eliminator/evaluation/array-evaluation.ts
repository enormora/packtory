import {
    Node as TypeScriptMorphNode,
    type ArrayLiteralExpression,
    type Expression,
    type SpreadElement
} from 'ts-morph';
import { unwrapExpression } from '../expression-unwrapping.ts';
import { createBindingReference, maximumEvaluationDepth, type EvaluationContext } from './evaluation-context.ts';
import { evaluated } from './primitive-value.ts';
import { isOpaqueArrayResult, opaqueResult, type AbstractValue, type EvaluationReference } from './abstract-value.ts';
import { intrinsicIntegrityOf } from './evaluation-environment.ts';

type ArrayEntry = AbstractValue | 'hole';

type ArrayEntries = readonly ArrayEntry[] | 'unknown-entries';

const arrayIteratorPath = [ 'Array', 'prototype', '@@iterator' ];

type EntryCollector = (array: ArrayLiteralExpression, context: EvaluationContext) => ArrayEntries | undefined;

function spreadEntries(
    element: SpreadElement,
    context: EvaluationContext,
    collect: EntryCollector
): ArrayEntries | undefined {
    if (!intrinsicIntegrityOf(element.getSourceFile()).isIntact(arrayIteratorPath)) {
        return undefined;
    }
    const source = unwrapExpression(element.getExpression());
    if (TypeScriptMorphNode.isArrayLiteralExpression(source)) {
        return collect(source, context);
    }
    const value = context.evaluate(source, context);
    return value !== undefined && isOpaqueArrayResult(value) ? 'unknown-entries' : undefined;
}

function elementEntries(
    element: Expression,
    context: EvaluationContext,
    collect: EntryCollector
): ArrayEntries | undefined {
    if (TypeScriptMorphNode.isOmittedExpression(element)) {
        return [ 'hole' ];
    }
    if (TypeScriptMorphNode.isSpreadElement(element)) {
        return spreadEntries(element, context, collect);
    }
    const value = context.evaluate(element, context);
    return value === undefined ? undefined : [ value ];
}

function combineEntries(current: ArrayEntries, next: ArrayEntries): ArrayEntries {
    return current === 'unknown-entries' || next === 'unknown-entries' ? 'unknown-entries' : [ ...current, ...next ];
}

function collectEntries(array: ArrayLiteralExpression, context: EvaluationContext): ArrayEntries | undefined {
    let entries: ArrayEntries = [];
    for (const element of array.getElements()) {
        const next = context.consume() ? elementEntries(element, context, collectEntries) : undefined;
        if (next === undefined) {
            return undefined;
        }
        entries = combineEntries(entries, next);
    }
    return entries;
}

function allocateArray(entries: readonly ArrayEntry[]): AbstractValue {
    const properties = new Map<string, EvaluationReference>([
        [ 'length', createBindingReference(evaluated(entries.length), false) ]
    ]);
    for (const [ index, entry ] of entries.entries()) {
        if (entry !== 'hole') {
            properties.set(String(index), createBindingReference(entry, true));
        }
    }
    return {
        value: {
            propertyReference(key) {
                return properties.get(key);
            }
        }
    };
}

export function evaluateArray(array: ArrayLiteralExpression, context: EvaluationContext): AbstractValue | undefined {
    if (context.depth >= maximumEvaluationDepth) {
        return undefined;
    }
    const entries = collectEntries(array, { ...context, depth: context.depth + 1 });
    if (entries === undefined) {
        return undefined;
    }
    return entries === 'unknown-entries' ? opaqueResult('array') : allocateArray(entries);
}
