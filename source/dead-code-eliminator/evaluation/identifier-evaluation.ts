import type { Identifier } from 'ts-morph';
import type { AbstractValue } from './abstract-value.ts';
import { declaredBindingValue } from './declared-binding-read.ts';
import { bindingReference, type EvaluationContext } from './evaluation-context.ts';
import { iterableArrayBindingValue } from './iterable-array-binding.ts';

export function evaluateIdentifier(identifier: Identifier, context: EvaluationContext): AbstractValue | undefined {
    return bindingReference(identifier, context)?.value ?? context.readConstant(identifier) ??
        iterableArrayBindingValue(identifier) ?? declaredBindingValue(identifier);
}
