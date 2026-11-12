import {
    Node as TypeScriptMorphNode,
    VariableDeclarationKind,
    type ExportAssignment,
    type Expression,
    type SourceFile,
    type Statement,
    type VariableDeclaration,
    type VariableStatement
} from 'ts-morph';
import type { RuntimeModuleResolver } from '../runtime-module-resolution.ts';
import { returnCreationIsPure } from '../liveness/builder-return.ts';
import { pureDeclarationKinds } from '../syntax-kind-sets.ts';
import { createSourceEvaluation, createSourceEvaluations, type SourceEvaluation } from './constant-evaluation.ts';
import { maximumEvaluationDepth } from './evaluation-context.ts';
import { runtimeImportBindings } from './runtime-import-bindings.ts';

type InitializationProof = (expression: Expression) => boolean;

function variableInitializationBoundary(
    statement: VariableStatement,
    prove: InitializationProof
): number {
    const kinds = [ VariableDeclarationKind.Const, VariableDeclarationKind.Let, VariableDeclarationKind.Var ];
    if (!kinds.includes(statement.getDeclarationKind())) {
        return statement.getStart() + 1;
    }
    const unsafe = statement.getDeclarations().find(function (declaration) {
        const initializer = declaration.getInitializer();
        return !TypeScriptMorphNode.isIdentifier(declaration.getNameNode()) ||
            initializer !== undefined && !prove(initializer);
    });
    return unsafe?.getEnd() ?? Number.POSITIVE_INFINITY;
}

function statementInitializationBoundary(statement: Statement, prove: InitializationProof): number {
    if (TypeScriptMorphNode.isVariableStatement(statement)) {
        return variableInitializationBoundary(statement, prove);
    }
    const safe =
        TypeScriptMorphNode.isExpressionStatement(statement) || TypeScriptMorphNode.isExportAssignment(statement)
            ? prove(statement.getExpression())
            : pureDeclarationKinds.has(statement.getKind()) || TypeScriptMorphNode.isImportDeclaration(statement);
    return safe ? Number.POSITIVE_INFINITY : statement.getStart() + 1;
}

function initializedImports(source: SourceFile): ReadonlySet<TypeScriptMorphNode> {
    const bindings = new Set<TypeScriptMorphNode>();
    for (const declaration of source.getImportDeclarations()) {
        for (const binding of runtimeImportBindings(declaration)) {
            bindings.add(binding);
        }
    }
    return bindings;
}

type SourceEvaluator = (source: SourceFile) => SourceEvaluation;

function initializationBoundary(sourceFile: SourceFile, evaluateSource: SourceEvaluator): number {
    if (sourceFile.isDeclarationFile()) {
        return 0;
    }
    const evaluation = evaluateSource(sourceFile);
    const imports = initializedImports(sourceFile);
    const prove: InitializationProof = function (expression) {
        return evaluation.canDiscard(expression) || returnCreationIsPure(expression, imports);
    };
    for (const statement of sourceFile.getStatements()) {
        const boundary = statementInitializationBoundary(statement, prove);
        if (boundary !== Number.POSITIVE_INFINITY) {
            return boundary;
        }
    }
    return Number.POSITIVE_INFINITY;
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

type InitializationGraph = {
    readonly dependenciesOf: (source: SourceFile) => readonly string[];
    readonly resolveModule: RuntimeModuleResolver;
    readonly prefixIsSafe: (source: SourceFile, limit: number) => boolean;
};

function initializationReaches(
    root: SourceFile,
    initializedThrough: number,
    graph: InitializationGraph
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
        const initialized = graph.dependenciesOf(sourceFile).every(function (specifier) {
            if (specifier.startsWith('node:')) {
                return true;
            }
            const dependency = graph.resolveModule(specifier, sourceFile);
            return dependency !== undefined && visit(dependency, dependency.getEnd(), next);
        }) && graph.prefixIsSafe(sourceFile, limit);
        if (!initialized) {
            return false;
        }
        completed.add(sourceFile);
        return true;
    }
    return visit(root, initializedThrough, new Set());
}

type ModuleInitialization = {
    readonly initializesBinding: (declaration: ExportAssignment | VariableDeclaration) => boolean;
    readonly dependenciesInitialize: (source: SourceFile) => boolean;
};

export function createModuleInitialization(
    resolveModule: RuntimeModuleResolver,
    evaluateSource: SourceEvaluator
): ModuleInitialization {
    const boundaries = new WeakMap<SourceFile, number>();
    const dependencies = new WeakMap<SourceFile, readonly string[]>();
    const graph: InitializationGraph = {
        resolveModule,
        dependenciesOf(source) {
            const specifiers = dependencies.get(source) ?? initializationDependencies(source);
            dependencies.set(source, specifiers);
            return specifiers;
        },
        prefixIsSafe(source, limit) {
            const boundary = boundaries.get(source) ?? initializationBoundary(source, evaluateSource);
            boundaries.set(source, boundary);
            return limit < boundary;
        }
    };
    return {
        initializesBinding(declaration) {
            return initializationReaches(
                declaration.getSourceFile(),
                declaration.getEnd(),
                graph
            );
        },
        dependenciesInitialize(source) {
            return initializationReaches(source, source.getStart(), graph);
        }
    };
}

export function moduleInitializesBinding(
    declaration: ExportAssignment | VariableDeclaration,
    resolveModule: RuntimeModuleResolver
): boolean {
    return createModuleInitialization(resolveModule, createSourceEvaluations(createSourceEvaluation))
        .initializesBinding(declaration);
}

export function moduleDependenciesInitialize(sourceFile: SourceFile, resolveModule: RuntimeModuleResolver): boolean {
    return createModuleInitialization(resolveModule, createSourceEvaluations(createSourceEvaluation))
        .dependenciesInitialize(sourceFile);
}
