import {
    Node as TsMorphNode,
    SyntaxKind,
    type ImportDeclaration,
    type SourceFile,
    type Statement
} from 'ts-morph';
import { variableDeclarationSurvives } from '../variable-declaration-bindings.ts';
import { isNamedDeclaration } from './named-declaration-kinds.ts';

function processNamedDeclaration(statement: Statement, survivingNames: ReadonlySet<string>): boolean {
    if (!isNamedDeclaration(statement)) {
        return false;
    }
    const name = statement.getName();
    if (name === undefined || survivingNames.has(name)) {
        return false;
    }
    statement.remove();
    return true;
}

function processVariableStatement(statement: Statement, survivingNames: ReadonlySet<string>): boolean {
    if (!TsMorphNode.isVariableStatement(statement)) {
        return false;
    }
    const removedDeclarators = statement.getDeclarations().filter(function (declarator) {
        return !variableDeclarationSurvives(declarator, survivingNames);
    });
    for (const declarator of removedDeclarators) {
        declarator.remove();
    }
    return removedDeclarators.length > 0;
}

export function processStatement(statement: Statement, survivingNames: ReadonlySet<string>): boolean {
    if (processNamedDeclaration(statement, survivingNames)) {
        return true;
    }
    return processVariableStatement(statement, survivingNames);
}

function importName(binding: ReturnType<ImportDeclaration['getNamedImports']>[number]): string {
    return binding.getAliasNode()?.getText() ?? binding.getName();
}

function hasRuntime(declaration: ImportDeclaration): boolean {
    if (declaration.isTypeOnly()) {
        return false;
    }
    const runtimeNamedCount = declaration
        .getNamedImports()
        .filter(function (binding) {
            return !binding.isTypeOnly();
        })
        .length;
    return (
        declaration.getDefaultImport() !== undefined ||
        declaration.getNamespaceImport() !== undefined ||
        runtimeNamedCount > 0
    );
}

function bindingCount(declaration: ImportDeclaration): number {
    return [ declaration.getDefaultImport(), declaration.getNamespaceImport(), ...declaration.getNamedImports() ]
        .filter(Boolean)
        .length;
}

function bareText(declaration: ImportDeclaration): string {
    const start = declaration.getStart();
    const specifier = declaration.getModuleSpecifier();
    const specifierEnd = specifier.getEnd() - start;
    return `import ${specifier.getText()}${declaration.getText().slice(specifierEnd)}`;
}

function dropDefault(declaration: ImportDeclaration, live: ReadonlySet<string>): void {
    const binding = declaration.getDefaultImport();
    if (binding !== undefined && !live.has(binding.getText())) {
        declaration.removeDefaultImport();
    }
}

function dropNamespace(declaration: ImportDeclaration, live: ReadonlySet<string>): void {
    const binding = declaration.getNamespaceImport();
    if (binding !== undefined && !live.has(binding.getText())) {
        declaration.removeNamespaceImport();
    }
}

function dropNamed(declaration: ImportDeclaration, live: ReadonlySet<string>): void {
    const deadBindings = declaration.getNamedImports().filter(function (binding) {
        return !live.has(importName(binding));
    });
    for (const binding of deadBindings) {
        binding.remove();
    }
}

function dropBindings(declaration: ImportDeclaration, live: ReadonlySet<string>): void {
    dropDefault(declaration, live);
    dropNamespace(declaration, live);
    dropNamed(declaration, live);
}

function repairEmpty(declaration: ImportDeclaration, runtime: boolean): void {
    if (runtime) {
        declaration.replaceWithText(bareText(declaration));
        return;
    }
    declaration.remove();
}

function repairImport(declaration: ImportDeclaration, live: ReadonlySet<string>): void {
    if (bindingCount(declaration) === 0) {
        return;
    }
    const runtime = hasRuntime(declaration);
    dropBindings(declaration, live);
    if (bindingCount(declaration) > 0) {
        return;
    }
    repairEmpty(declaration, runtime);
}

function hasExport(statement: Statement): boolean {
    return TsMorphNode.isModifierable(statement) && statement.hasModifier(SyntaxKind.ExportKeyword);
}

function hasModuleSyntax(sourceFile: SourceFile): boolean {
    if (
        sourceFile.getImportDeclarations().length > 0 ||
        sourceFile.getExportDeclarations().length > 0 ||
        sourceFile.getExportAssignments().length > 0
    ) {
        return true;
    }
    return sourceFile.getStatements().some(hasExport);
}

function repairImports(sourceFile: SourceFile, live: ReadonlySet<string>): void {
    for (const declaration of sourceFile.getImportDeclarations()) {
        repairImport(declaration, live);
    }
}

function preserveModuleStatus(sourceFile: SourceFile, wasModule: boolean): void {
    if (wasModule && !hasModuleSyntax(sourceFile)) {
        sourceFile.insertStatements(0, 'export {};');
    }
}

export function repairImportDeclarations(sourceFile: SourceFile, survivingNames: ReadonlySet<string>): boolean {
    const originalText = sourceFile.getFullText();
    const wasModule = hasModuleSyntax(sourceFile);
    repairImports(sourceFile, survivingNames);
    preserveModuleStatus(sourceFile, wasModule);
    return sourceFile.getFullText() !== originalText;
}
