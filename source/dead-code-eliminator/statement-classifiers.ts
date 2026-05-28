import {
    SyntaxKind,
    type ClassDeclaration,
    type ExportAssignment,
    type ImportDeclaration,
    type Statement,
    type VariableStatement
} from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../config/dead-code-elimination-settings.ts';
import { hasClassImpurity } from './class-purity.ts';
import { isPureExpression } from './pure-expression.ts';

type StatementClassifier = (
    statement: Statement,
    settings: DeadCodeEliminationSettings | undefined
) => string | undefined;

function isBareCssImport(specifier: string): boolean {
    return specifier.endsWith('.css');
}

function classifyImportDeclaration(statement: ImportDeclaration): string | undefined {
    if (isBareCssImport(statement.getModuleSpecifierValue())) {
        return 'css import';
    }
    return undefined;
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
    if (kind === SyntaxKind.VariableStatement) {
        return variableStatementClassifier;
    }
    if (kind === SyntaxKind.ExpressionStatement) {
        return expressionStatementClassifier;
    }
    return undefined;
}

export function statementClassifierFor(kind: SyntaxKind): StatementClassifier | undefined {
    return declarationStatementClassifierFor(kind) ?? executableStatementClassifierFor(kind);
}
