import { Node as TypeScriptMorphNode, SyntaxKind, type Statement, type TryStatement, type IfStatement } from 'ts-morph';
import { applySourcePreparation, type SourcePreparation } from '../../source-transformation/source-preparation.ts';
import { hasDynamicScope } from '../dynamic-scope.ts';
import { sourceReplacement } from './source-replacement.ts';
import { isNamedDeclaration } from './named-declaration-kinds.ts';

const abruptStatements = new Set([
    SyntaxKind.ReturnStatement,
    SyntaxKind.ThrowStatement,
    SyntaxKind.BreakStatement,
    SyntaxKind.ContinueStatement
]);

type AbruptCompletionProof = (statement: Statement) => boolean;

function branchesCompleteAbruptly(statement: IfStatement, abrupt: AbruptCompletionProof): boolean {
    const alternative = statement.getElseStatement();
    return alternative !== undefined && abrupt(statement.getThenStatement()) && abrupt(alternative);
}

function tryCompletesAbruptly(statement: TryStatement, abrupt: AbruptCompletionProof): boolean {
    const finalizer = statement.getFinallyBlock();
    if (finalizer !== undefined && abrupt(finalizer)) {
        return true;
    }
    const handler = statement.getCatchClause();
    return abrupt(statement.getTryBlock()) && (handler === undefined || abrupt(handler.getBlock()));
}

function completesAbruptly(statement: Statement): boolean {
    if (abruptStatements.has(statement.getKind())) {
        return true;
    }
    if (TypeScriptMorphNode.isBlock(statement)) {
        return statement.getStatements().some(completesAbruptly);
    }
    if (TypeScriptMorphNode.isIfStatement(statement)) {
        return branchesCompleteAbruptly(statement, completesAbruptly);
    }
    if (TypeScriptMorphNode.isTryStatement(statement)) {
        return tryCompletesAbruptly(statement, completesAbruptly);
    }
    return false;
}

function statementSequence(node: TypeScriptMorphNode): readonly Statement[] {
    if (
        TypeScriptMorphNode.isBlock(node) || TypeScriptMorphNode.isCaseClause(node) ||
        TypeScriptMorphNode.isDefaultClause(node)
    ) {
        return node.getStatements();
    }
    return [];
}

function declaresBinding(statement: Statement): boolean {
    return [ statement, ...statement.getDescendants() ].some(function (node) {
        return TypeScriptMorphNode.isVariableDeclaration(node) ||
            TypeScriptMorphNode.isStatement(node) && isNamedDeclaration(node);
    });
}

export function removeUnreachableStatements(preparation: SourcePreparation): void {
    if (hasDynamicScope(preparation.sourceFile)) {
        return;
    }
    applySourcePreparation(preparation, function (source) {
        let previousEnd = 0;
        return source.getDescendants().flatMap(function (node) {
            if (node.getStart() < previousEnd) {
                return [];
            }
            const statements = statementSequence(node);
            const termination = statements.findIndex(completesAbruptly);
            if (termination === -1) {
                return [];
            }
            return statements.slice(termination + 1).flatMap(function (statement) {
                if (declaresBinding(statement) || TypeScriptMorphNode.isEmptyStatement(statement)) {
                    return [];
                }
                previousEnd = statement.getEnd();
                return sourceReplacement(statement, []);
            });
        });
    });
}
