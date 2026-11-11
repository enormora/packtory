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

export function localBindingReferences(name: Identifier, declaration: VariableDeclaration): readonly Identifier[] {
    return declaration.getSourceFile().getDescendantsOfKind(SyntaxKind.Identifier).filter(function (reference) {
        return reference !== name && reference.getSymbol()?.getDeclarations().includes(declaration) === true;
    });
}

export function bindingReferenceTargets(name: Identifier): readonly TypeScriptMorphNodeType[] {
    return name.findReferences().flatMap(function (group) {
        return group.getReferences().map(referenceTarget);
    });
}

type BindingReferenceResolver = (name: Identifier) => readonly (TypeScriptMorphNodeType | undefined)[];

export function createBindingReferenceResolver(readReferences: BindingReferenceResolver): BindingReferenceResolver {
    const cached = new WeakMap<Identifier, readonly (TypeScriptMorphNodeType | undefined)[]>();
    return function (name) {
        const existing = cached.get(name);
        if (existing !== undefined) {
            return existing;
        }
        const unique = new Set(readReferences(name));
        unique.delete(name);
        const references = Array.from(unique);
        cached.set(name, references);
        return references;
    };
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
