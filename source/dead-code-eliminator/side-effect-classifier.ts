import { Node as TsMorphNode, type SourceFile, type Statement } from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../config/dead-code-elimination-settings.ts';
import type { SideEffectStatement } from './analyzed-bundle.ts';
import { booleanValue, factsAfterStatement, type BooleanFacts } from './liveness/boolean-facts.ts';
import { statementClassifierFor } from './statement-classifiers.ts';
import { describeControlFlowStatementKind, pureDeclarationKinds } from './syntax-kind-sets.ts';

function isStaticallyUnreachableIfStatement(statement: Statement, facts: BooleanFacts): boolean {
    return TsMorphNode.isIfStatement(statement) &&
        statement.getElseStatement() === undefined &&
        booleanValue(statement.getExpression(), facts) === false;
}

function classifyResidualStatement(
    statement: Statement,
    settings: DeadCodeEliminationSettings | undefined
): string | undefined {
    const kind = statement.getKind();
    const controlFlowKind = describeControlFlowStatementKind(kind);
    if (controlFlowKind !== undefined) {
        return controlFlowKind;
    }
    const classifier = statementClassifierFor(kind);
    if (classifier !== undefined) {
        return classifier(statement, settings);
    }
    return 'unknown statement';
}

function classifyTopLevelStatement(
    statement: Statement,
    settings: DeadCodeEliminationSettings | undefined,
    facts: BooleanFacts
): string | undefined {
    if (pureDeclarationKinds.has(statement.getKind()) || isStaticallyUnreachableIfStatement(statement, facts)) {
        return undefined;
    }
    return classifyResidualStatement(statement, settings);
}

export function classifySideEffects(
    sourceFile: Readonly<SourceFile>,
    settings?: DeadCodeEliminationSettings
): readonly SideEffectStatement[] {
    const results: SideEffectStatement[] = [];
    let facts: BooleanFacts = new Map();
    for (const statement of sourceFile.getStatements()) {
        const kind = classifyTopLevelStatement(statement, settings, facts);
        if (kind !== undefined) {
            results.push({ line: statement.getStartLineNumber(), kind });
        }
        facts = factsAfterStatement(statement, facts);
    }
    return results;
}
