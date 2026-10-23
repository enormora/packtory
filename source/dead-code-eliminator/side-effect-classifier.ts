import { Node as TypeScriptMorphNode, type SourceFile, type Statement } from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../configuration/dead-code-elimination-settings.ts';
import type { ExpressionPurityChecker } from './imported-expression-origin.ts';
import { createExpressionPurityChecker } from './pure-expression.ts';
import {
    createRuntimeModuleResolver,
    type RuntimeModuleOrigin
} from './runtime-module-resolution.ts';
import type { SideEffectStatement } from './analyzed-bundle.ts';
import { booleanValue, factsAfterStatement, type BooleanFacts } from './liveness/boolean-facts.ts';
import { statementClassifierFor } from './statement-classifiers.ts';
import { describeControlFlowStatementKind, pureDeclarationKinds } from './syntax-kind-sets.ts';

function isStaticallyUnreachableIfStatement(statement: Statement, facts: BooleanFacts): boolean {
    return TypeScriptMorphNode.isIfStatement(statement) &&
        statement.getElseStatement() === undefined &&
        booleanValue(statement.getExpression(), facts) === false;
}

function classifyResidualStatement(
    statement: Statement,
    isPure: ExpressionPurityChecker
): string | undefined {
    const kind = statement.getKind();
    const controlFlowKind = describeControlFlowStatementKind(kind);
    if (controlFlowKind !== undefined) {
        return controlFlowKind;
    }
    const classifier = statementClassifierFor(kind);
    if (classifier !== undefined) {
        return classifier(statement, isPure);
    }
    return 'unknown statement';
}

function classifyTopLevelStatement(
    statement: Statement,
    isPure: ExpressionPurityChecker,
    facts: BooleanFacts
): string | undefined {
    if (pureDeclarationKinds.has(statement.getKind()) || isStaticallyUnreachableIfStatement(statement, facts)) {
        return undefined;
    }
    return classifyResidualStatement(statement, isPure);
}

function classifyPreparedSideEffects(
    sourceFile: Readonly<SourceFile>,
    isPure: ExpressionPurityChecker
): readonly SideEffectStatement[] {
    const results: SideEffectStatement[] = [];
    let facts: BooleanFacts = new Map();
    for (const statement of sourceFile.getStatements()) {
        const kind = classifyTopLevelStatement(statement, isPure, facts);
        if (kind !== undefined) {
            results.push({ line: statement.getStartLineNumber(), kind });
        }
        facts = factsAfterStatement(statement, facts);
    }
    return results;
}

export type SideEffectClassifier = (
    sourceFile: Readonly<SourceFile>,
    settings: DeadCodeEliminationSettings | undefined
) => readonly SideEffectStatement[];

export function createSideEffectClassifier(files: readonly RuntimeModuleOrigin[]): SideEffectClassifier {
    const resolveModule = createRuntimeModuleResolver(files);
    return function (sourceFile, settings) {
        return classifyPreparedSideEffects(sourceFile, createExpressionPurityChecker(settings, resolveModule));
    };
}
