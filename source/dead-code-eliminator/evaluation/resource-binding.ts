import { VariableDeclarationKind, type VariableDeclaration, type Expression } from 'ts-morph';
import type { AbstractValue } from './abstract-value.ts';

export function resourceBindingIsHarmless(
    kind: VariableDeclarationKind,
    value: AbstractValue | undefined
): boolean {
    return kind === VariableDeclarationKind.Using && value !== undefined &&
        (value.value === null || value.value === undefined);
}

type ResourceBindingEvaluation = (expression: Expression) => AbstractValue | undefined;

export function resourceDeclarationIsHarmless(
    kind: VariableDeclarationKind,
    declaration: VariableDeclaration,
    evaluate: ResourceBindingEvaluation
): boolean {
    const initializer = declaration.getInitializer();
    return initializer !== undefined && resourceBindingIsHarmless(kind, evaluate(initializer));
}
