import { VariableDeclarationKind } from 'ts-morph';
import type { AbstractValue } from './abstract-value.ts';

export function resourceBindingIsHarmless(
    kind: VariableDeclarationKind,
    value: AbstractValue | undefined
): boolean {
    return kind === VariableDeclarationKind.Using && value !== undefined &&
        (value.value === null || value.value === undefined);
}
