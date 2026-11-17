import { Node as TypeScriptMorphNode, SyntaxKind, type CaseOrDefaultClause, type Statement } from 'ts-morph';
import type { AbstractValue } from './abstract-value.ts';
import { normalCompletion, type Completion, type EvaluationContext } from './evaluation-context.ts';

function clauseMatches(
    clause: CaseOrDefaultClause,
    discriminant: AbstractValue,
    context: EvaluationContext
): boolean | undefined {
    if (!context.consume()) {
        return undefined;
    }
    if (TypeScriptMorphNode.isDefaultClause(clause)) {
        return false;
    }
    const candidate = context.evaluate(clause.getExpression(), context);
    return candidate === undefined ? undefined : candidate.value === discriminant.value;
}

function selectClause(
    clauses: readonly CaseOrDefaultClause[],
    discriminant: AbstractValue,
    context: EvaluationContext
): CaseOrDefaultClause | null | undefined {
    let fallback: CaseOrDefaultClause | null = null;
    for (const clause of clauses) {
        const matches = clauseMatches(clause, discriminant, context);
        if (matches === undefined) {
            return undefined;
        }
        if (matches) {
            return clause;
        }
        if (TypeScriptMorphNode.isDefaultClause(clause)) {
            fallback = clause;
        }
    }
    return fallback;
}

function executeClause(clause: CaseOrDefaultClause, context: EvaluationContext): Completion | undefined {
    if (!context.consume()) {
        return undefined;
    }
    for (const statement of clause.getStatements()) {
        const completion = context.execute(statement, context);
        if (completion?.type !== 'normal') {
            return completion;
        }
    }
    return normalCompletion;
}

function executeSelectedClauses(
    clauses: readonly CaseOrDefaultClause[],
    selected: CaseOrDefaultClause,
    context: EvaluationContext
): Completion | undefined {
    const remaining = clauses.slice(clauses.indexOf(selected));
    for (const clause of remaining) {
        const completion = executeClause(clause, context);
        if (completion?.type !== 'normal') {
            return completion?.type === 'break' ? normalCompletion : completion;
        }
    }
    return normalCompletion;
}

export function evaluateSwitch(statement: Statement, context: EvaluationContext): Completion | undefined {
    const branch = statement.asKindOrThrow(SyntaxKind.SwitchStatement);
    const discriminant = context.evaluate(branch.getExpression(), context);
    if (discriminant === undefined) {
        return undefined;
    }
    const local = { ...context, locals: context.locals.fork() };
    const clauses = branch.getClauses();
    const selected = selectClause(clauses, discriminant, local);
    if (selected === undefined) {
        return undefined;
    }
    return selected === null ? normalCompletion : executeSelectedClauses(clauses, selected, local);
}
