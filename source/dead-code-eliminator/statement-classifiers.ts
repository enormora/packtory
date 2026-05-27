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

export type StatementClassifier = (
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

export const statementClassifiers: ReadonlyMap<SyntaxKind, StatementClassifier> = new Map<
    SyntaxKind,
    StatementClassifier
>([
    [
        SyntaxKind.ImportDeclaration,
        (statement) => {
            return classifyImportDeclaration(statement.asKindOrThrow(SyntaxKind.ImportDeclaration));
        }
    ],
    [
        SyntaxKind.ExportAssignment,
        (statement, settings) => {
            return classifyExportAssignment(statement.asKindOrThrow(SyntaxKind.ExportAssignment), settings);
        }
    ],
    [
        SyntaxKind.ClassDeclaration,
        (statement, settings) => {
            return classifyClassDeclaration(statement.asKindOrThrow(SyntaxKind.ClassDeclaration), settings);
        }
    ],
    [
        SyntaxKind.VariableStatement,
        (statement, settings) => {
            return classifyVariableStatement(statement.asKindOrThrow(SyntaxKind.VariableStatement), settings);
        }
    ],
    [
        SyntaxKind.ExpressionStatement,
        () => {
            return 'expression statement';
        }
    ]
]);
