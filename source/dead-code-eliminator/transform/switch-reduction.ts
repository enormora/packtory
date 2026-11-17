import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    type CaseOrDefaultClause,
    type Statement,
    type SwitchStatement
} from 'ts-morph';
import type { PrimitiveValue } from '../evaluation/primitive-value.ts';
import type { SourceEvaluation } from '../evaluation/constant-evaluation.ts';
import type { SourcePart } from './source-replacement.ts';
import { isNamedDeclaration } from './named-declaration-kinds.ts';

function hasBindingDeclarations(branch: SwitchStatement): boolean {
    return branch.getCaseBlock().getDescendants().some(function (node) {
        if (TypeScriptMorphNode.isVariableDeclarationList(node)) {
            return true;
        }
        return isNamedDeclaration(node);
    });
}

function matchingClause(
    branch: SwitchStatement,
    value: PrimitiveValue,
    evaluate: SourceEvaluation
): CaseOrDefaultClause | null | undefined {
    const cases = branch.getClauses().filter(TypeScriptMorphNode.isCaseClause);
    for (const clause of cases) {
        const candidate = evaluate.primitiveValue(clause.getExpression());
        if (candidate === undefined) {
            return undefined;
        }
        if (value === candidate.value) {
            return clause;
        }
    }
    return branch.getClauses().find(TypeScriptMorphNode.isDefaultClause) ?? null;
}

function selectedClause(branch: SwitchStatement, evaluate: SourceEvaluation): CaseOrDefaultClause | null | undefined {
    const value = evaluate.primitiveValue(branch.getExpression());
    return value === undefined ? undefined : matchingClause(branch, value.value, evaluate);
}

function selectedStatements(branch: SwitchStatement, selected: CaseOrDefaultClause | null): readonly Statement[] {
    if (selected === null) {
        return [];
    }
    const statements = branch.getClauses().slice(branch.getClauses().indexOf(selected)).flatMap(function (clause) {
        return clause.getStatements();
    });
    const termination = statements.findIndex(function (statement) {
        return TypeScriptMorphNode.isBreakStatement(statement) && statement.getLabel() === undefined;
    });
    return termination === -1 ? statements : statements.slice(0, termination);
}

function hasSwitchBreak(statement: Statement, branch: SwitchStatement): boolean {
    return [ statement, ...statement.getDescendantsOfKind(SyntaxKind.BreakStatement) ].some(function (node) {
        if (!TypeScriptMorphNode.isBreakStatement(node) || node.getLabel() !== undefined) {
            return false;
        }
        return node.getFirstAncestor(function (parent) {
            return TypeScriptMorphNode.isSwitchStatement(parent) || TypeScriptMorphNode.isIterationStatement(parent);
        }) === branch;
    });
}

export function constantSwitchSource(
    branch: SwitchStatement,
    evaluate: SourceEvaluation
): readonly SourcePart[] | undefined {
    if (hasBindingDeclarations(branch)) {
        return undefined;
    }
    const selected = selectedClause(branch, evaluate);
    if (selected === undefined) {
        return undefined;
    }
    const statements = selectedStatements(branch, selected);
    const hasBreak = statements.some(function (statement) {
        return hasSwitchBreak(statement, branch);
    });
    const replacement: readonly SourcePart[] = [ hasBreak ? 'switch(0){default:' : '{', ...statements, '}' ];
    const text = replacement
        .map(function (part) {
            return typeof part === 'string' ? part : part.getText();
        })
        .join('');
    return text === branch.getText() ? undefined : replacement;
}
