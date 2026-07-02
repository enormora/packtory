import {
    Node as TsMorphNode,
    type ClassDeclaration,
    type EnumDeclaration,
    type ExportAssignment,
    type FunctionDeclaration,
    type ImportDeclaration,
    type InterfaceDeclaration,
    type ModuleDeclaration,
    type SourceFile,
    type Statement,
    type TypeAliasDeclaration,
    type VariableStatement
} from 'ts-morph';
import { collectVariableDeclarationBindings } from '../variable-declaration-bindings.ts';

export type BindingDescriptor = {
    readonly name: string;
    readonly isExported: boolean;
    readonly statement: Statement;
    readonly declarationNode: TsMorphNode;
    readonly referenceNode: TsMorphNode;
};

type ObjectDeclarationStatement = ClassDeclaration | InterfaceDeclaration | TypeAliasDeclaration;
type NamedDeclarationStatement = EnumDeclaration | FunctionDeclaration | ModuleDeclaration | ObjectDeclarationStatement;

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
    return [ { name, isExported, statement, declarationNode: statement, referenceNode: statement } ];
}

function bindingsFromVariableStatement(statement: VariableStatement): readonly BindingDescriptor[] {
    const isExported = statement.isExported();
    return statement.getDeclarations().flatMap(function (declarator) {
        return collectVariableDeclarationBindings(declarator).map(function (binding) {
            return {
                name: binding.name,
                isExported,
                statement,
                declarationNode: binding.declarationNode,
                referenceNode: binding.referenceNode
            };
        });
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
            declarationNode: defaultImport.getParent(),
            referenceNode: defaultImport.getParent()
        });
    }
    const namespaceImport = statement.getNamespaceImport();
    if (namespaceImport !== undefined) {
        result.push({
            name: namespaceImport.getText(),
            isExported: false,
            statement,
            declarationNode: namespaceImport.getParent(),
            referenceNode: namespaceImport.getParent()
        });
    }
    for (const namedImport of statement.getNamedImports()) {
        result.push({
            name: localNameOfNamedImport(namedImport),
            isExported: false,
            statement,
            declarationNode: namedImport,
            referenceNode: namedImport
        });
    }
    return result;
}

function bindingsFromExportAssignment(statement: ExportAssignment): readonly BindingDescriptor[] {
    if (statement.isExportEquals()) {
        return [];
    }
    return [
        {
            name: 'default',
            isExported: true,
            statement,
            declarationNode: statement,
            referenceNode: statement
        }
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
    if (TsMorphNode.isExportAssignment(statement)) {
        return bindingsFromExportAssignment(statement);
    }
    return [];
}

export function extractTopLevelBindings(sourceFile: Readonly<SourceFile>): readonly BindingDescriptor[] {
    return sourceFile.getStatements().flatMap(bindingsFromStatement);
}
