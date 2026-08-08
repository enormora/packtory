import { Node as TsMorphNode, SyntaxKind, type ImportDeclaration, type SourceFile, type Statement } from 'ts-morph';

function localNameOfNamedImport(namedImport: ReturnType<ImportDeclaration['getNamedImports']>[number]): string {
    return namedImport.getAliasNode()?.getText() ?? namedImport.getName();
}

function hasRuntimeSpecifier(importDeclaration: ImportDeclaration): boolean {
    if (importDeclaration.isTypeOnly()) {
        return false;
    }
    const namedRuntimeImportCount = importDeclaration
        .getNamedImports()
        .filter(function (namedImport) {
            return !namedImport.isTypeOnly();
        })
        .length;
    return (
        importDeclaration.getDefaultImport() !== undefined ||
        importDeclaration.getNamespaceImport() !== undefined ||
        namedRuntimeImportCount > 0
    );
}

function specifierCount(importDeclaration: ImportDeclaration): number {
    return [
        importDeclaration.getDefaultImport(),
        importDeclaration.getNamespaceImport(),
        ...importDeclaration.getNamedImports()
    ]
        .filter(function (specifier) {
            return specifier !== undefined;
        })
        .length;
}

function bareImportText(importDeclaration: ImportDeclaration): string {
    const statementStart = importDeclaration.getStart();
    const moduleSpecifier = importDeclaration.getModuleSpecifier();
    const moduleSpecifierEnd = moduleSpecifier.getEnd() - statementStart;
    return `import ${moduleSpecifier.getText()}${importDeclaration.getText().slice(moduleSpecifierEnd)}`;
}

function removeDeadDefaultImport(importDeclaration: ImportDeclaration, survivingNames: ReadonlySet<string>): void {
    const defaultImport = importDeclaration.getDefaultImport();
    if (defaultImport !== undefined && !survivingNames.has(defaultImport.getText())) {
        importDeclaration.removeDefaultImport();
    }
}

function removeDeadNamespaceImport(importDeclaration: ImportDeclaration, survivingNames: ReadonlySet<string>): void {
    const namespaceImport = importDeclaration.getNamespaceImport();
    if (namespaceImport !== undefined && !survivingNames.has(namespaceImport.getText())) {
        importDeclaration.removeNamespaceImport();
    }
}

function removeDeadNamedImports(importDeclaration: ImportDeclaration, survivingNames: ReadonlySet<string>): void {
    const deadNamedImports = importDeclaration.getNamedImports().filter(function (namedImport) {
        return !survivingNames.has(localNameOfNamedImport(namedImport));
    });
    for (const namedImport of deadNamedImports) {
        namedImport.remove();
    }
}

function removeDeadImportSpecifiers(importDeclaration: ImportDeclaration, survivingNames: ReadonlySet<string>): void {
    removeDeadDefaultImport(importDeclaration, survivingNames);
    removeDeadNamespaceImport(importDeclaration, survivingNames);
    removeDeadNamedImports(importDeclaration, survivingNames);
}

function repairEmptyImportDeclaration(importDeclaration: ImportDeclaration, hadRuntimeSpecifier: boolean): void {
    if (hadRuntimeSpecifier) {
        importDeclaration.replaceWithText(bareImportText(importDeclaration));
        return;
    }
    importDeclaration.remove();
}

function repairImportDeclaration(importDeclaration: ImportDeclaration, survivingNames: ReadonlySet<string>): void {
    if (specifierCount(importDeclaration) === 0) {
        return;
    }
    const hadRuntimeSpecifier = hasRuntimeSpecifier(importDeclaration);
    removeDeadImportSpecifiers(importDeclaration, survivingNames);
    if (specifierCount(importDeclaration) > 0) {
        return;
    }
    repairEmptyImportDeclaration(importDeclaration, hadRuntimeSpecifier);
}

function hasExportFlags(statement: Statement): boolean {
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
    return sourceFile.getStatements().some(hasExportFlags);
}

function repairAllImportDeclarations(sourceFile: SourceFile, survivingNames: ReadonlySet<string>): void {
    for (const importDeclaration of sourceFile.getImportDeclarations()) {
        repairImportDeclaration(importDeclaration, survivingNames);
    }
}

function insertModuleMarkerIfNeeded(sourceFile: SourceFile, wasModule: boolean): void {
    if (wasModule && !hasModuleSyntax(sourceFile)) {
        sourceFile.insertStatements(0, 'export {};');
    }
}

export function repairImportDeclarations(sourceFile: SourceFile, survivingNames: ReadonlySet<string>): boolean {
    const originalText = sourceFile.getFullText();
    const wasModule = hasModuleSyntax(sourceFile);
    repairAllImportDeclarations(sourceFile, survivingNames);
    insertModuleMarkerIfNeeded(sourceFile, wasModule);
    return sourceFile.getFullText() !== originalText;
}
