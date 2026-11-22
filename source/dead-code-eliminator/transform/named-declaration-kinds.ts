import { SyntaxKind, type Statement, type Node as TypeScriptMorphNode } from 'ts-morph';

const namedDeclarationKinds: ReadonlySet<SyntaxKind> = new Set([
    SyntaxKind.FunctionDeclaration,
    SyntaxKind.ClassDeclaration,
    SyntaxKind.InterfaceDeclaration,
    SyntaxKind.TypeAliasDeclaration,
    SyntaxKind.EnumDeclaration,
    SyntaxKind.ModuleDeclaration
]);

export type NamedStatement = Statement & { readonly getName: () => string | undefined; };

export function isNamedDeclaration(node: TypeScriptMorphNode): node is NamedStatement {
    return namedDeclarationKinds.has(node.getKind());
}
