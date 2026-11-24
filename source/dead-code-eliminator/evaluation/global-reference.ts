import type { Identifier } from 'ts-morph';
import { hasDynamicScope } from '../dynamic-scope.ts';

export function resolvesToGlobal(reference: Identifier): boolean {
    const declarations = reference.getSymbol()?.getDeclarations() ?? [];
    return declarations.length === 0 && !hasDynamicScope(reference.getSourceFile());
}

export function intrinsicUndefined(reference: Identifier): boolean {
    return reference.getText() === 'undefined' && resolvesToGlobal(reference);
}
