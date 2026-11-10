import {
    Node as TypeScriptMorphNode,
    type SourceFile,
    type Statement,
    type ExportDeclaration,
    type FunctionDeclaration,
    type ClassDeclaration
} from 'ts-morph';
import { recordBindingRemoved, type RemovalPlan } from './declaration-removal.ts';

function removeDefaultDeclaration(statement: ClassDeclaration | FunctionDeclaration): void {
    if (!statement.isDefaultExport()) {
        return;
    }
    if (statement.getName() === undefined) {
        statement.remove();
    } else {
        statement.setIsExported(false);
    }
}

function removeDefaultExport(statement: Statement, plan: RemovalPlan): void {
    if (TypeScriptMorphNode.isExportAssignment(statement) && !statement.isExportEquals()) {
        recordBindingRemoved(plan, 'default');
        statement.remove();
        return;
    }
    if (TypeScriptMorphNode.isFunctionDeclaration(statement) || TypeScriptMorphNode.isClassDeclaration(statement)) {
        removeDefaultDeclaration(statement);
    }
}

function removeUnusedSpecifiers(declaration: ExportDeclaration, surviving: ReadonlySet<string>): void {
    const namespace = declaration.getNamespaceExport();
    if (namespace !== undefined && !surviving.has(namespace.getName())) {
        namespace.replaceWithText('{}');
        return;
    }
    for (const specifier of declaration.getNamedExports()) {
        const name = (specifier.getAliasNode() ?? specifier.getNameNode()).compilerNode.text;
        if (!surviving.has(name)) {
            specifier.remove();
        }
    }
}

export function removeUnusedExports(sourceFile: SourceFile, plan: RemovalPlan): void {
    const surviving = plan.survivingExportNames;
    if (surviving === undefined) {
        return;
    }
    for (const declaration of sourceFile.getExportDeclarations()) {
        removeUnusedSpecifiers(declaration, surviving);
    }
    if (!surviving.has('default')) {
        for (const statement of sourceFile.getStatements()) {
            removeDefaultExport(statement, plan);
        }
    }
}
