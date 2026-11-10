import {
    Node as TypeScriptMorphNode,
    VariableDeclarationKind,
    type ExportAssignment,
    type Expression,
    type ImportDeclaration,
    type SourceFile,
    type Statement,
    type VariableDeclaration,
    type VariableStatement
} from 'ts-morph';
import type { RuntimeModuleResolver } from '../runtime-module-resolution.ts';
import { returnCreationIsPure } from '../liveness/builder-return.ts';
import { pureDeclarationKinds } from '../syntax-kind-sets.ts';
import { createSourceEvaluation } from './constant-evaluation.ts';
import { maximumEvaluationDepth } from './evaluation-context.ts';

type InitializationProof = (expression: Expression) => boolean;

function variableInitializationIsSafe(
    statement: VariableStatement,
    limit: number,
    prove: InitializationProof
): boolean {
    const kinds = [ VariableDeclarationKind.Const, VariableDeclarationKind.Let, VariableDeclarationKind.Var ];
    if (!kinds.includes(statement.getDeclarationKind())) {
        return false;
    }
    return statement
        .getDeclarations()
        .filter(function (declaration) {
            return declaration.getStart() < limit;
        })
        .every(function (declaration) {
            const initializer = declaration.getInitializer();
            return TypeScriptMorphNode.isIdentifier(declaration.getNameNode()) &&
                (initializer === undefined || prove(initializer));
        });
}

function statementInitializationIsSafe(statement: Statement, limit: number, prove: InitializationProof): boolean {
    if (TypeScriptMorphNode.isVariableStatement(statement)) {
        return variableInitializationIsSafe(statement, limit, prove);
    }
    if (TypeScriptMorphNode.isExpressionStatement(statement) || TypeScriptMorphNode.isExportAssignment(statement)) {
        return prove(statement.getExpression());
    }
    return pureDeclarationKinds.has(statement.getKind()) || TypeScriptMorphNode.isImportDeclaration(statement);
}

function importedBindings(declaration: ImportDeclaration): readonly TypeScriptMorphNode[] {
    if (declaration.isTypeOnly()) {
        return [];
    }
    const clause = declaration.getImportClause();
    const namespace = declaration.getNamespaceImport();
    return [
        ...clause?.getDefaultImport() === undefined ? [] : [ clause ],
        ...namespace === undefined ? [] : [ namespace.getParentOrThrow() ],
        ...declaration.getNamedImports().filter(function (named) {
            return !named.isTypeOnly();
        })
    ];
}

function initializedImports(source: SourceFile): ReadonlySet<TypeScriptMorphNode> {
    return new Set(source.getImportDeclarations().flatMap(importedBindings));
}

function initializationPrefixIsSafe(sourceFile: SourceFile, limit: number): boolean {
    if (sourceFile.isDeclarationFile()) {
        return false;
    }
    const evaluation = createSourceEvaluation(sourceFile);
    const imports = initializedImports(sourceFile);
    const prove: InitializationProof = function (expression) {
        return evaluation.canDiscard(expression) || returnCreationIsPure(expression, imports);
    };
    return sourceFile
        .getStatements()
        .filter(function (statement) {
            return statement.getStart() < limit;
        })
        .every(function (statement) {
            return statementInitializationIsSafe(statement, limit, prove);
        });
}

function initializationDependencies(sourceFile: SourceFile): readonly string[] {
    return [
        ...sourceFile
            .getImportDeclarations()
            .filter(function (declaration) {
                return !declaration.isTypeOnly();
            })
            .map(function (declaration) {
                return declaration.getModuleSpecifierValue();
            }),
        ...sourceFile
            .getExportDeclarations()
            .filter(function (declaration) {
                return !declaration.isTypeOnly();
            })
            .flatMap(function (declaration) {
                const specifier = declaration.getModuleSpecifierValue();
                return specifier === undefined ? [] : [ specifier ];
            })
    ];
}

function initializationReaches(
    root: SourceFile,
    initializedThrough: number,
    resolveModule: RuntimeModuleResolver
): boolean {
    const completed = new Set<SourceFile>();
    function visit(sourceFile: SourceFile, limit: number, ancestors: ReadonlySet<SourceFile>): boolean {
        if (ancestors.has(sourceFile) || ancestors.size >= maximumEvaluationDepth) {
            return false;
        }
        if (completed.has(sourceFile)) {
            return true;
        }
        const next = new Set([ ...ancestors, sourceFile ]);
        const initialized = initializationDependencies(sourceFile).every(function (specifier) {
            if (specifier.startsWith('node:')) {
                return true;
            }
            const dependency = resolveModule(specifier, sourceFile);
            return dependency !== undefined && visit(dependency, dependency.getEnd(), next);
        }) && initializationPrefixIsSafe(sourceFile, limit);
        if (initialized) {
            completed.add(sourceFile);
        }
        return initialized;
    }
    return visit(root, initializedThrough, new Set());
}

export function moduleInitializesBinding(
    declaration: ExportAssignment | VariableDeclaration,
    resolveModule: RuntimeModuleResolver
): boolean {
    return initializationReaches(declaration.getSourceFile(), declaration.getEnd(), resolveModule);
}

export function moduleDependenciesInitialize(sourceFile: SourceFile, resolveModule: RuntimeModuleResolver): boolean {
    return initializationReaches(sourceFile, sourceFile.getStart(), resolveModule);
}
