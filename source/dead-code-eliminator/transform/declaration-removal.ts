import {
    Node as TsMorphNode,
    SyntaxKind,
    type ImportDeclaration,
    type SourceFile,
    type Statement
} from 'ts-morph';
import { isDeclarationCodeTargetPath } from '../liveness/runtime-code.ts';
import { bindingId } from '../reachability/binding-id.ts';
import {
    collectVariableDeclarationBindings,
    variableDeclarationSurvives
} from '../variable-declaration-bindings.ts';
import type { RemovalPlan } from './declaration-removal-plan.ts';
import { isNamedDeclaration } from './named-declaration-kinds.ts';

function recordBindingRemoved(plan: RemovalPlan, name: string): void {
    if (plan.trace !== undefined) {
        plan.trace.collector.record({
            type: 'binding-removed',
            bundleName: plan.bundleName,
            bindingId: bindingId(plan.targetFilePath, name),
            inputFilePath: plan.inputFilePath
        });
    }
}

function processNamedDeclaration(statement: Statement, plan: RemovalPlan): boolean {
    if (!isNamedDeclaration(statement)) {
        return false;
    }
    const name = statement.getName();
    if (name === undefined || plan.survivingNames.has(name)) {
        return false;
    }
    recordBindingRemoved(plan, name);
    statement.remove();
    return true;
}

function processVariableStatement(statement: Statement, plan: RemovalPlan): boolean {
    if (!TsMorphNode.isVariableStatement(statement)) {
        return false;
    }
    const removedDeclarators = statement.getDeclarations().filter(function (declarator) {
        return !variableDeclarationSurvives(declarator, plan.survivingNames);
    });
    for (const declarator of removedDeclarators) {
        for (const binding of collectVariableDeclarationBindings(declarator)) {
            recordBindingRemoved(plan, binding.name);
        }
        declarator.remove();
    }
    return removedDeclarators.length > 0;
}

export function processStatement(statement: Statement, plan: RemovalPlan): boolean {
    if (processNamedDeclaration(statement, plan)) {
        return true;
    }
    return processVariableStatement(statement, plan);
}

function importName(binding: ReturnType<ImportDeclaration['getNamedImports']>[number]): string {
    return binding.getAliasNode()?.getText() ?? binding.getName();
}

function hasRuntime(declaration: ImportDeclaration): boolean {
    if (isDeclarationCodeTargetPath(declaration.getSourceFile().getFilePath())) {
        return false;
    }
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

function recordImportBindingDropped(plan: RemovalPlan, declaration: ImportDeclaration, bindingName: string): void {
    if (plan.trace !== undefined) {
        plan.trace.collector.record({
            type: 'import-repaired',
            bundleName: plan.bundleName,
            targetFilePath: plan.targetFilePath,
            moduleSpecifier: declaration.getModuleSpecifierValue(),
            repairKind: 'binding-dropped',
            bindingName
        });
    }
}

function recordImportRepair(
    plan: RemovalPlan,
    declaration: ImportDeclaration,
    repairKind: 'converted-to-bare' | 'removed-declaration-file-import' | 'removed-type-only'
): void {
    if (plan.trace !== undefined) {
        plan.trace.collector.record({
            type: 'import-repaired',
            bundleName: plan.bundleName,
            targetFilePath: plan.targetFilePath,
            moduleSpecifier: declaration.getModuleSpecifierValue(),
            repairKind
        });
    }
}

function dropDefault(declaration: ImportDeclaration, plan: RemovalPlan): void {
    const binding = declaration.getDefaultImport();
    if (binding !== undefined && !plan.survivingNames.has(binding.getText())) {
        recordImportBindingDropped(plan, declaration, binding.getText());
        declaration.removeDefaultImport();
    }
}

function dropNamespace(declaration: ImportDeclaration, plan: RemovalPlan): void {
    const binding = declaration.getNamespaceImport();
    if (binding !== undefined && !plan.survivingNames.has(binding.getText())) {
        recordImportBindingDropped(plan, declaration, binding.getText());
        declaration.removeNamespaceImport();
    }
}

function dropNamed(declaration: ImportDeclaration, plan: RemovalPlan): void {
    const deadBindings = declaration.getNamedImports().filter(function (binding) {
        return !plan.survivingNames.has(importName(binding));
    });
    for (const binding of deadBindings) {
        recordImportBindingDropped(plan, declaration, importName(binding));
        binding.remove();
    }
}

function dropBindings(declaration: ImportDeclaration, plan: RemovalPlan): void {
    dropDefault(declaration, plan);
    dropNamespace(declaration, plan);
    dropNamed(declaration, plan);
}

function importRemovalKind(plan: RemovalPlan): 'removed-declaration-file-import' | 'removed-type-only' {
    return isDeclarationCodeTargetPath(plan.targetFilePath)
        ? 'removed-declaration-file-import'
        : 'removed-type-only';
}

function repairEmpty(declaration: ImportDeclaration, runtime: boolean, plan: RemovalPlan): void {
    if (runtime) {
        recordImportRepair(plan, declaration, 'converted-to-bare');
        declaration.replaceWithText(bareText(declaration));
        return;
    }
    recordImportRepair(plan, declaration, importRemovalKind(plan));
    declaration.remove();
}

function repairImport(declaration: ImportDeclaration, plan: RemovalPlan): void {
    if (bindingCount(declaration) === 0) {
        return;
    }
    const runtime = hasRuntime(declaration);
    dropBindings(declaration, plan);
    if (bindingCount(declaration) > 0) {
        return;
    }
    repairEmpty(declaration, runtime, plan);
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

function repairImports(sourceFile: SourceFile, plan: RemovalPlan): void {
    for (const declaration of sourceFile.getImportDeclarations()) {
        repairImport(declaration, plan);
    }
}

function preserveModuleStatus(sourceFile: SourceFile, wasModule: boolean): void {
    if (wasModule && !hasModuleSyntax(sourceFile)) {
        sourceFile.insertStatements(0, 'export {};');
    }
}

export function repairImportDeclarations(sourceFile: SourceFile, plan: RemovalPlan): boolean {
    const originalText = sourceFile.getFullText();
    const wasModule = hasModuleSyntax(sourceFile);
    repairImports(sourceFile, plan);
    preserveModuleStatus(sourceFile, wasModule);
    return sourceFile.getFullText() !== originalText;
}
