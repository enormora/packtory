import {
    SyntaxKind,
    type ClassDeclaration,
    type EnumDeclaration,
    type ExportAssignment,
    type ImportDeclaration,
    type ModuleDeclaration,
    type Statement,
    type VariableStatement
} from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../config/dead-code-elimination-settings.ts';
import { hasClassImpurity } from './class-purity.ts';
import { sideEffectAssetImportKind } from './liveness/asset-side-effects.ts';
import { isPureExpression } from './pure-expression.ts';

type StatementClassifier = (
    statement: Statement,
    settings: DeadCodeEliminationSettings | undefined
) => string | undefined;

function classifyImportDeclaration(statement: ImportDeclaration): string | undefined {
    return sideEffectAssetImportKind(statement.getModuleSpecifierValue());
}

function classifyExportAssignment(
    statement: ExportAssignment,
    settings: DeadCodeEliminationSettings | undefined
): string | undefined {
    if (isPureExpression(statement.getExpression(), settings)) {
        return undefined;
    }
    return 'export assignment';
}

function classifyClassDeclaration(
    statement: ClassDeclaration,
    settings: DeadCodeEliminationSettings | undefined
): string | undefined {
    if (hasClassImpurity(statement, settings)) {
        return 'class declaration';
    }
    return undefined;
}

function classifyEnumDeclaration(
    statement: EnumDeclaration,
    settings: DeadCodeEliminationSettings | undefined
): string | undefined {
    if (statement.isConstEnum()) {
        return undefined;
    }
    for (const member of statement.getMembers()) {
        const initializer = member.getInitializer();
        if (initializer !== undefined && !isPureExpression(initializer, settings)) {
            return 'enum declaration';
        }
    }

    return undefined;
}

function classifyModuleDeclaration(statement: ModuleDeclaration): string | undefined {
    if (statement.isAmbient()) {
        return undefined;
    }
    return 'module declaration';
}

function classifyVariableStatement(
    statement: VariableStatement,
    settings: DeadCodeEliminationSettings | undefined
): string | undefined {
    for (const declarator of statement.getDeclarations()) {
        const initializer = declarator.getInitializer();
        if (initializer !== undefined && !isPureExpression(initializer, settings)) {
            return 'variable initializer';
        }
    }

    return undefined;
}

function importDeclarationClassifier(statement: Statement): string | undefined {
    return classifyImportDeclaration(statement.asKindOrThrow(SyntaxKind.ImportDeclaration));
}

function exportAssignmentClassifier(
    statement: Statement,
    settings: DeadCodeEliminationSettings | undefined
): string | undefined {
    return classifyExportAssignment(statement.asKindOrThrow(SyntaxKind.ExportAssignment), settings);
}

function classDeclarationClassifier(
    statement: Statement,
    settings: DeadCodeEliminationSettings | undefined
): string | undefined {
    return classifyClassDeclaration(statement.asKindOrThrow(SyntaxKind.ClassDeclaration), settings);
}

function enumDeclarationClassifier(
    statement: Statement,
    settings: DeadCodeEliminationSettings | undefined
): string | undefined {
    return classifyEnumDeclaration(statement.asKindOrThrow(SyntaxKind.EnumDeclaration), settings);
}

function moduleDeclarationClassifier(statement: Statement): string | undefined {
    return classifyModuleDeclaration(statement.asKindOrThrow(SyntaxKind.ModuleDeclaration));
}

function variableStatementClassifier(
    statement: Statement,
    settings: DeadCodeEliminationSettings | undefined
): string | undefined {
    return classifyVariableStatement(statement.asKindOrThrow(SyntaxKind.VariableStatement), settings);
}

function expressionStatementClassifier(): string {
    return 'expression statement';
}

function declarationStatementClassifierFor(kind: SyntaxKind): StatementClassifier | undefined {
    if (kind === SyntaxKind.ImportDeclaration) {
        return importDeclarationClassifier;
    }
    if (kind === SyntaxKind.ExportAssignment) {
        return exportAssignmentClassifier;
    }
    return undefined;
}

function executableStatementClassifierFor(kind: SyntaxKind): StatementClassifier | undefined {
    if (kind === SyntaxKind.ClassDeclaration) {
        return classDeclarationClassifier;
    }
    if (kind === SyntaxKind.EnumDeclaration) {
        return enumDeclarationClassifier;
    }
    if (kind === SyntaxKind.ModuleDeclaration) {
        return moduleDeclarationClassifier;
    }
    if (kind === SyntaxKind.VariableStatement) {
        return variableStatementClassifier;
    }
    return kind === SyntaxKind.ExpressionStatement ? expressionStatementClassifier : undefined;
}

export function statementClassifierFor(kind: SyntaxKind): StatementClassifier | undefined {
    return declarationStatementClassifierFor(kind) ?? executableStatementClassifierFor(kind);
}
