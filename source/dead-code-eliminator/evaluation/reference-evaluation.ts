import type { Identifier, PropertyAccessExpression } from 'ts-morph';
import type { AbstractValue } from './abstract-value.ts';
import { declaredBindingValue } from './declared-binding-read.ts';
import { bindingReference, type EvaluationContext } from './evaluation-context.ts';
import { importedMemberValue } from './imported-value.ts';
import { iterableArrayBindingValue } from './constant-shape.ts';
import { recordPropertyReference } from './record-evaluation.ts';

export function evaluateIdentifier(identifier: Identifier, context: EvaluationContext): AbstractValue | undefined {
    return bindingReference(identifier, context)?.value ?? context.readConstant(identifier) ??
        iterableArrayBindingValue(identifier) ?? declaredBindingValue(identifier);
}

export function evaluateMember(
    access: PropertyAccessExpression,
    context: EvaluationContext
): AbstractValue | undefined {
    return recordPropertyReference(access, context)?.value ?? importedMemberValue(access, context);
}
