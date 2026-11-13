import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    type ImportDeclaration,
    type SourceFile,
    type Statement
} from 'ts-morph';
import type { DeadCodeEliminationTrace } from '../trace.ts';
import { isDeclarationCodeTargetPath } from '../liveness/runtime-code.ts';
import { bindingIdentifier } from '../reachability/binding-identifier.ts';
import {
    collectVariableDeclarationBindings,
    variableDeclarationSurvives
} from '../variable-declaration-bindings.ts';
import { isNamedDeclaration } from './named-declaration-kinds.ts';

export function recordBindingRemoved(plan: RemovalPlan, name: string): void {
    if (plan.trace !== undefined) {
        plan.trace.collector.record({
            type: 'binding-removed',
            bundleName: plan.bundleName,
            bindingIdentifier: bindingIdentifier(plan.targetFilePath, name),
            inputFilePath: plan.inputFilePath
        });
    }
}

function removedVariableBindings(statement: Statement, plan: RemovalPlan): readonly string[] | undefined {
    if (TypeScriptMorphNode.isVariableStatement(statement)) {
        const declarations = statement.getDeclarations();
        if (
            declarations.some(function (declaration) {
                return variableDeclarationSurvives(declaration, plan.survivingNames);
            })
        ) {
            return undefined;
        }
        return declarations.flatMap(collectVariableDeclarationBindings).map(function (binding) {
            return binding.name;
        });
    }
    return undefined;
}

function removedStatementBindings(statement: Statement, plan: RemovalPlan): readonly string[] | undefined {
    if (!isNamedDeclaration(statement)) {
        return removedVariableBindings(statement, plan);
    }
    const name = statement.getName();
    if (name === undefined || plan.survivingNames.has(name)) {
        return undefined;
    }
    return [ name ];
}

function processVariableStatement(statement: Statement, plan: RemovalPlan): void {
    if (!TypeScriptMorphNode.isVariableStatement(statement)) {
        return;
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
}

export function processStatements(sourceFile: SourceFile, plan: RemovalPlan): void {
    const ranges: [number, number][] = [];
    sourceFile.getStatements().forEach(function (statement, index) {
        const bindings = removedStatementBindings(statement, plan);
        if (bindings === undefined) {
            processVariableStatement(statement, plan);
            return;
        }
        bindings.forEach(function (name) {
            recordBindingRemoved(plan, name);
        });
        const previous = ranges.at(-1);
        if (previous?.[1] === index - 1) {
            previous[1] = index;
        } else {
            ranges.push([ index, index ]);
        }
    });
    for (const range of ranges.toReversed()) {
        sourceFile.removeStatements(range);
    }
}

function importName(binding: ReturnType<ImportDeclaration['getNamedImports']>[number]): string {
    return binding.getAliasNode()?.getText() ?? binding.getName();
}

function hasRuntime(declaration: ImportDeclaration): boolean {
    if (isDeclarationCodeTargetPath(declaration.getSourceFile().getFilePath()) || declaration.isTypeOnly()) {
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
    return TypeScriptMorphNode.isModifierable(statement) && statement.hasModifier(SyntaxKind.ExportKeyword);
}

export function hasModuleSyntax(sourceFile: SourceFile): boolean {
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

export function repairImportDeclarations(sourceFile: SourceFile, plan: RemovalPlan, wasModule: boolean): boolean {
    const originalText = sourceFile.getFullText();
    repairImports(sourceFile, plan);
    preserveModuleStatus(sourceFile, wasModule);
    return sourceFile.getFullText() !== originalText;
}

export type RemovalPlan = {
    readonly bundleName: string;
    readonly inputFilePath: string;
    readonly targetFilePath: string;
    readonly survivingNames: ReadonlySet<string>;
    readonly survivingExportNames: ReadonlySet<string> | undefined;
    readonly trace: DeadCodeEliminationTrace;
};
