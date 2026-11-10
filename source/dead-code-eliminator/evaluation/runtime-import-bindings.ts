import type { ImportDeclaration, Node as TypeScriptMorphNode } from 'ts-morph';

export function* runtimeImportBindings(declaration: ImportDeclaration): Iterable<TypeScriptMorphNode> {
    if (declaration.isTypeOnly()) {
        return;
    }
    const defaultBinding = declaration.getDefaultImport();
    if (defaultBinding !== undefined) {
        yield defaultBinding.getParentOrThrow();
    }
    const namespace = declaration.getNamespaceImport();
    if (namespace !== undefined) {
        yield namespace.getParentOrThrow();
    }
    yield* declaration.getNamedImports().filter(function (named) {
        return !named.isTypeOnly();
    });
}
