import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    VariableDeclarationKind,
    type ClassDeclaration,
    type EnumDeclaration,
    type ExportAssignment,
    type ImportDeclaration,
    type ModuleDeclaration,
    type Statement,
    type VariableStatement
} from 'ts-morph';
import type { ExpressionPurityChecker } from './imported-expression-origin.ts';
import { hasClassImpurity, type ClassPropertyKeyResolver } from './class-purity.ts';
import { sideEffectAssetImportKind } from './liveness/asset-side-effects.ts';
import { createRuntimeSourceEvaluation } from './evaluation/constant-evaluation.ts';
import { resourceDeclarationIsHarmless } from './evaluation/resource-binding.ts';

type StatementClassifier = (
    statement: Statement,
    isPure: ExpressionPurityChecker,
    propertyKeyFor: ClassPropertyKeyResolver
) => string | undefined;

function classifyImportDeclaration(statement: ImportDeclaration): string | undefined {
    return sideEffectAssetImportKind(statement.getModuleSpecifierValue());
}

function classifyExportAssignment(
    statement: ExportAssignment,
    isPure: ExpressionPurityChecker
): string | undefined {
    if (isPure(statement.getExpression())) {
        return undefined;
    }
    return 'export assignment';
}

function classifyClassDeclaration(
    statement: ClassDeclaration,
    isPure: ExpressionPurityChecker,
    propertyKeyFor: ClassPropertyKeyResolver
): string | undefined {
    if (hasClassImpurity(statement, isPure, propertyKeyFor)) {
        return 'class declaration';
    }
    return undefined;
}

function classifyEnumDeclaration(
    statement: EnumDeclaration,
    isPure: ExpressionPurityChecker
): string | undefined {
    if (statement.isConstEnum()) {
        return undefined;
    }
    for (const member of statement.getMembers()) {
        const initializer = member.getInitializer();
        if (initializer !== undefined && !isPure(initializer)) {
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

function resourceStatementHasEffects(statement: VariableStatement): boolean {
    const kind = statement.getDeclarationKind();
    if (![ VariableDeclarationKind.Using, VariableDeclarationKind.AwaitUsing ].includes(kind)) {
        return false;
    }
    const evaluate = createRuntimeSourceEvaluation(statement.getSourceFile()).primitiveValue;
    return statement.getDeclarations().some(function (declaration) {
        return !resourceDeclarationIsHarmless(kind, declaration, evaluate);
    });
}

function classifyVariableStatement(
    statement: VariableStatement,
    isPure: ExpressionPurityChecker
): string | undefined {
    if (resourceStatementHasEffects(statement)) {
        return 'resource declaration';
    }
    for (const declarator of statement.getDeclarations()) {
        if (!TypeScriptMorphNode.isIdentifier(declarator.getNameNode())) {
            return 'variable binding pattern';
        }
        const initializer = declarator.getInitializer();
        if (initializer !== undefined && !isPure(initializer)) {
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
    isPure: ExpressionPurityChecker
): string | undefined {
    return classifyExportAssignment(statement.asKindOrThrow(SyntaxKind.ExportAssignment), isPure);
}

function classDeclarationClassifier(
    statement: Statement,
    isPure: ExpressionPurityChecker,
    propertyKeyFor: ClassPropertyKeyResolver
): string | undefined {
    return classifyClassDeclaration(statement.asKindOrThrow(SyntaxKind.ClassDeclaration), isPure, propertyKeyFor);
}

function enumDeclarationClassifier(
    statement: Statement,
    isPure: ExpressionPurityChecker
): string | undefined {
    return classifyEnumDeclaration(statement.asKindOrThrow(SyntaxKind.EnumDeclaration), isPure);
}

function moduleDeclarationClassifier(statement: Statement): string | undefined {
    return classifyModuleDeclaration(statement.asKindOrThrow(SyntaxKind.ModuleDeclaration));
}

function variableStatementClassifier(
    statement: Statement,
    isPure: ExpressionPurityChecker
): string | undefined {
    return classifyVariableStatement(statement.asKindOrThrow(SyntaxKind.VariableStatement), isPure);
}

function expressionStatementClassifier(): string {
    return 'expression statement';
}

const statementClassifiers: Readonly<Partial<Record<SyntaxKind, StatementClassifier>>> = {
    [SyntaxKind.ImportDeclaration]: importDeclarationClassifier,
    [SyntaxKind.ExportAssignment]: exportAssignmentClassifier,
    [SyntaxKind.ClassDeclaration]: classDeclarationClassifier,
    [SyntaxKind.EnumDeclaration]: enumDeclarationClassifier,
    [SyntaxKind.ModuleDeclaration]: moduleDeclarationClassifier,
    [SyntaxKind.VariableStatement]: variableStatementClassifier,
    [SyntaxKind.ExpressionStatement]: expressionStatementClassifier
};

export function statementClassifierFor(kind: SyntaxKind): StatementClassifier | undefined {
    return statementClassifiers[kind];
}
