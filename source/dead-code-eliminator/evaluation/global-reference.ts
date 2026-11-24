import { Node as TypeScriptMorphNode, type Identifier, type Node as TypeScriptMorphNodeType } from 'ts-morph';
import { hasDynamicScope } from '../dynamic-scope.ts';

function referencedSymbol(reference: Identifier): ReturnType<Identifier['getSymbol']> {
    const parent = reference.getParent();
    return TypeScriptMorphNode.isShorthandPropertyAssignment(parent) ? parent.getValueSymbol() : reference.getSymbol();
}

export function bindingDeclarationsOf(reference: Identifier): readonly TypeScriptMorphNodeType[] {
    const declarations = referencedSymbol(reference)?.getDeclarations() ?? [];
    return declarations.filter(function isBindingDeclaration(declaration) {
        return !TypeScriptMorphNode.isExpression(declaration);
    });
}

export function resolvesToGlobal(reference: Identifier): boolean {
    return bindingDeclarationsOf(reference).length === 0 && !hasDynamicScope(reference.getSourceFile());
}

export function intrinsicUndefined(reference: Identifier): boolean {
    return reference.getText() === 'undefined' && resolvesToGlobal(reference);
}
