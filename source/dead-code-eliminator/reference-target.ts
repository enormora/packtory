import {
    Node as TypeScriptMorphNode,
    type Node as TypeScriptMorphNodeType,
    type Identifier,
    type Symbol as TypeScriptMorphSymbol,
    type ReferenceEntry
} from 'ts-morph';

export function referenceTarget(reference: ReferenceEntry): TypeScriptMorphNodeType | undefined {
    const span = reference.getTextSpan();
    const source = reference.getSourceFile();
    return source.getDescendantAtStartWithWidth(span.getStart(), span.getLength()) ??
        source.getDescendantAtPos(span.getStart());
}

function valueSymbolAt(reference: Identifier): TypeScriptMorphSymbol | undefined {
    const parent = reference.getParent();
    if (TypeScriptMorphNode.isShorthandPropertyAssignment(parent)) {
        return parent.getValueSymbol();
    }
    return TypeScriptMorphNode.isExportSpecifier(parent) ? parent.getLocalTargetSymbol() : reference.getSymbol();
}

export function referenceMayUseBinding(
    reference: TypeScriptMorphNodeType,
    declaration: TypeScriptMorphNodeType
): boolean {
    if (!TypeScriptMorphNode.isIdentifier(reference)) {
        return true;
    }
    const symbol = valueSymbolAt(reference);
    if (symbol === undefined) {
        return true;
    }
    const aliases = symbol.getAliasedSymbol()?.getDeclarations() ?? [];
    return symbol.getDeclarations().includes(declaration) || aliases.includes(declaration);
}
