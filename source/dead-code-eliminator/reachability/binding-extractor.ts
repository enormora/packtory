import {
    Node as TsMorphNode,
    SyntaxKind,
    type ClassDeclaration,
    type EnumDeclaration,
    type FunctionDeclaration,
    type ImportDeclaration,
    type InterfaceDeclaration,
    type ModuleDeclaration,
    type SourceFile,
    type Statement,
    type TypeAliasDeclaration,
    type VariableStatement
} from 'ts-morph';

export type BindingDescriptor = {
    readonly name: string;
    readonly isExported: boolean;
    readonly statement: Statement;
    readonly declarationNode: TsMorphNode;
};

type NamedDeclarationStatement =
    | ClassDeclaration
    | EnumDeclaration
    | FunctionDeclaration
    | InterfaceDeclaration
    | ModuleDeclaration
    | TypeAliasDeclaration;

const namedDeclarationKinds: ReadonlySet<SyntaxKind> = new Set([
    SyntaxKind.FunctionDeclaration,
    SyntaxKind.ClassDeclaration,
    SyntaxKind.InterfaceDeclaration,
    SyntaxKind.TypeAliasDeclaration,
    SyntaxKind.EnumDeclaration,
    SyntaxKind.ModuleDeclaration
]);

function isNamedDeclaration(statement: Statement): statement is NamedDeclarationStatement {
    return namedDeclarationKinds.has(statement.getKind());
}

function isStatementExported(statement: NamedDeclarationStatement | VariableStatement): boolean {
    return statement.isExported() || statement.isDefaultExport();
}

function bindingsFromVariableStatement(statement: VariableStatement): readonly BindingDescriptor[] {
    const isExported = statement.isExported();
    return statement.getDeclarations().map((declarator) => {
        return { name: declarator.getName(), isExported, statement, declarationNode: declarator };
    });
}

function bindingsFromNamedDeclaration(statement: NamedDeclarationStatement): readonly BindingDescriptor[] {
    const name = statement.getName();
    if (name === undefined) {
        return [];
    }
    return [{ name, isExported: isStatementExported(statement), statement, declarationNode: statement }];
}

function localNameOfNamedImport(namedImport: ReturnType<ImportDeclaration['getNamedImports']>[number]): string {
    const aliasNode = namedImport.getAliasNode();
    if (aliasNode === undefined) {
        return namedImport.getName();
    }
    return aliasNode.getText();
}

function defaultImportBinding(statement: ImportDeclaration): readonly BindingDescriptor[] {
    const defaultImport = statement.getDefaultImport();
    if (defaultImport === undefined) {
        return [];
    }
    return [
        {
            name: defaultImport.getText(),
            isExported: false,
            statement,
            declarationNode: defaultImport.getParent()
        }
    ];
}

function namespaceImportBinding(statement: ImportDeclaration): readonly BindingDescriptor[] {
    const namespaceImport = statement.getNamespaceImport();
    if (namespaceImport === undefined) {
        return [];
    }
    return [
        {
            name: namespaceImport.getText(),
            isExported: false,
            statement,
            declarationNode: namespaceImport.getParent()
        }
    ];
}

function namedImportBindings(statement: ImportDeclaration): readonly BindingDescriptor[] {
    return statement.getNamedImports().map((namedImport) => {
        return {
            name: localNameOfNamedImport(namedImport),
            isExported: false,
            statement,
            declarationNode: namedImport
        };
    });
}

function bindingsFromImportDeclaration(statement: ImportDeclaration): readonly BindingDescriptor[] {
    return [
        ...defaultImportBinding(statement),
        ...namespaceImportBinding(statement),
        ...namedImportBindings(statement)
    ];
}

function bindingsFromStatement(statement: Statement): readonly BindingDescriptor[] {
    if (isNamedDeclaration(statement)) {
        return bindingsFromNamedDeclaration(statement);
    }
    if (TsMorphNode.isVariableStatement(statement)) {
        return bindingsFromVariableStatement(statement);
    }
    if (TsMorphNode.isImportDeclaration(statement)) {
        return bindingsFromImportDeclaration(statement);
    }
    return [];
}

export function extractTopLevelBindings(sourceFile: Readonly<SourceFile>): readonly BindingDescriptor[] {
    return sourceFile.getStatements().flatMap(bindingsFromStatement);
}
