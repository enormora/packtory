import {
    Node as TsMorphNode,
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

function isNamedDeclaration(statement: Statement): statement is NamedDeclarationStatement {
    return (
        TsMorphNode.isFunctionDeclaration(statement) ||
        TsMorphNode.isClassDeclaration(statement) ||
        TsMorphNode.isInterfaceDeclaration(statement) ||
        TsMorphNode.isTypeAliasDeclaration(statement) ||
        TsMorphNode.isEnumDeclaration(statement) ||
        TsMorphNode.isModuleDeclaration(statement)
    );
}

function bindingsFromNamedDeclaration(statement: NamedDeclarationStatement): readonly BindingDescriptor[] {
    const name = statement.getName();
    if (name === undefined) {
        return [];
    }
    const isExported = statement.isExported() || statement.isDefaultExport();
    return [{ name, isExported, statement, declarationNode: statement }];
}

function bindingsFromVariableStatement(statement: VariableStatement): readonly BindingDescriptor[] {
    const isExported = statement.isExported();
    return statement.getDeclarations().map((declarator) => {
        return { name: declarator.getName(), isExported, statement, declarationNode: declarator };
    });
}

function localNameOfNamedImport(namedImport: ReturnType<ImportDeclaration['getNamedImports']>[number]): string {
    return namedImport.getAliasNode()?.getText() ?? namedImport.getName();
}

function bindingsFromImportDeclaration(statement: ImportDeclaration): readonly BindingDescriptor[] {
    const result: BindingDescriptor[] = [];
    const defaultImport = statement.getDefaultImport();
    if (defaultImport !== undefined) {
        result.push({
            name: defaultImport.getText(),
            isExported: false,
            statement,
            declarationNode: defaultImport.getParent()
        });
    }
    const namespaceImport = statement.getNamespaceImport();
    if (namespaceImport !== undefined) {
        result.push({
            name: namespaceImport.getText(),
            isExported: false,
            statement,
            declarationNode: namespaceImport.getParent()
        });
    }
    for (const namedImport of statement.getNamedImports()) {
        result.push({
            name: localNameOfNamedImport(namedImport),
            isExported: false,
            statement,
            declarationNode: namedImport
        });
    }
    return result;
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
