import {
    Node as TypeScriptMorphNode,
    type Node as TypeScriptMorphNodeType,
    SyntaxKind,
    type Identifier,
    type VariableDeclaration,
    type FunctionDeclaration,
    type NamespaceImport,
    type Symbol as TypeScriptMorphSymbol,
    type ReferenceEntry
} from 'ts-morph';

export function referenceTarget(reference: ReferenceEntry): TypeScriptMorphNodeType {
    const span = reference.getTextSpan();
    const source = reference.getSourceFile();
    return source.getDescendantAtStartWithWidth(span.getStart(), span.getLength()) ??
        source.getDescendantAtPos(span.getStart()) ?? source;
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
    return symbol.getDeclarations().includes(declaration) ||
        symbol.getAliasedSymbol()?.getDeclarations().includes(declaration) === true;
}

function isBindingDeclaration(
    node: TypeScriptMorphNodeType | undefined
): node is FunctionDeclaration | NamespaceImport | VariableDeclaration {
    return TypeScriptMorphNode.isVariableDeclaration(node) || TypeScriptMorphNode.isFunctionDeclaration(node) ||
        TypeScriptMorphNode.isNamespaceImport(node);
}

export function referenceDeclaresBinding(reference: TypeScriptMorphNodeType): boolean {
    const parent = reference.getParent();
    return isBindingDeclaration(parent) && parent.getNameNode()?.getStart() === reference.getStart();
}

export function referenceAliasName(reference: TypeScriptMorphNodeType): Identifier | undefined {
    const parent = reference.getParent();
    if (
        !TypeScriptMorphNode.isVariableDeclaration(parent) ||
        parent.getInitializer()?.getStart() !== reference.getStart()
    ) {
        return undefined;
    }
    return parent.getNameNode().asKind(SyntaxKind.Identifier);
}
