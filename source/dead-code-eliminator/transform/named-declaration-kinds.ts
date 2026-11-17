import { SyntaxKind, type Node as TypeScriptMorphNode, type Statement } from 'ts-morph';

const namedDeclarationKinds: ReadonlySet<SyntaxKind> = new Set([
    SyntaxKind.FunctionDeclaration,
    SyntaxKind.ClassDeclaration,
    SyntaxKind.InterfaceDeclaration,
    SyntaxKind.TypeAliasDeclaration,
    SyntaxKind.EnumDeclaration,
    SyntaxKind.ModuleDeclaration
]);

export type NamedStatement = Statement & { readonly getName: () => string | undefined; };

export function isNamedDeclaration(statement: TypeScriptMorphNode): statement is NamedStatement {
    return namedDeclarationKinds.has(statement.getKind());
}
