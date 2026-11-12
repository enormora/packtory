import {
    Node as TypeScriptMorphNode,
    VariableDeclarationKind,
    type BinaryExpression,
    type ConditionalExpression,
    type Expression,
    type ExpressionStatement,
    type IfStatement,
    type Node as TypeScriptMorphNodeType,
    type SourceFile,
    type Statement
} from 'ts-morph';
import { isTruthy } from 'remeda';
import { applySourcePreparation, type SourcePreparation } from '../../source-transformation/source-preparation.ts';
import { hasDynamicScope } from '../dynamic-scope.ts';
import { createSourceEvaluation, type SourceEvaluation } from '../evaluation/constant-evaluation.ts';
import { conditionOutcome, isShortCircuitOperator, selectsLeft } from '../evaluation/condition-outcome.ts';
import { runtimeSourceIsValid } from '../runtime-source-validity.ts';
import { sourceReplacement, type SourcePart } from './source-replacement.ts';
import { primitiveSource } from './primitive-source.ts';
import { removeUnreachableStatements } from './unreachable-statements.ts';

function declarationIsHoisted(node: TypeScriptMorphNodeType): boolean {
    if (TypeScriptMorphNode.isVariableDeclarationList(node)) {
        return node.getDeclarationKind() === VariableDeclarationKind.Var;
    }
    return TypeScriptMorphNode.isFunctionDeclaration(node);
}

function hasHoistedDeclarations(statement: Statement | undefined): boolean {
    if (statement === undefined) {
        return false;
    }
    return [ statement, ...statement.getDescendants() ].some(declarationIsHoisted);
}

function selectedValueSource(expression: Expression, evaluate: SourceEvaluation): readonly SourcePart[] {
    const value = evaluate.primitiveValue(expression);
    const literal = value === undefined ? undefined : primitiveSource(value);
    return literal !== undefined && literal.length <= expression.getWidth()
        ? [ `(${literal})` ]
        : [ '(0, ', expression, ')' ];
}

function selectedStatementSource(selected: Statement | undefined): readonly SourcePart[] {
    if (selected === undefined) {
        return [ ';' ];
    }
    return TypeScriptMorphNode.isBlock(selected) ? [ selected ] : [ '{ ', selected, ' }' ];
}

function constantBranchSource(statement: IfStatement, evaluate: SourceEvaluation): readonly SourcePart[] | undefined {
    const expression = statement.getExpression();
    const condition = conditionOutcome(expression, evaluate, 0).truthy;
    if (
        condition === undefined ||
        [ statement.getThenStatement(), statement.getElseStatement() ].some(hasHoistedDeclarations)
    ) {
        return undefined;
    }
    const selected = selectedStatementSource(condition ? statement.getThenStatement() : statement.getElseStatement());
    return evaluate.canDiscard(expression) ? selected : [ '{ (', expression, '); ', ...selected, ' }' ];
}

function afterCondition(
    condition: Expression,
    selected: Expression,
    evaluate: SourceEvaluation
): readonly SourcePart[] {
    const result = selectedValueSource(selected, evaluate);
    return evaluate.canDiscard(condition) ? result : [ '(', condition, ', ', ...result, ')' ];
}

function conditionalSource(
    expression: ConditionalExpression,
    evaluate: SourceEvaluation
): readonly SourcePart[] | undefined {
    const condition = conditionOutcome(expression.getCondition(), evaluate, 0).truthy;
    if (condition === undefined) {
        return undefined;
    }
    return afterCondition(
        expression.getCondition(),
        condition ? expression.getWhenTrue() : expression.getWhenFalse(),
        evaluate
    );
}

function shortCircuitSource(
    expression: BinaryExpression,
    evaluate: SourceEvaluation
): readonly SourcePart[] | undefined {
    const operator = expression.getOperatorToken().getKind();
    if (!isShortCircuitOperator(operator)) {
        return undefined;
    }
    const left = expression.getLeft();
    const selected = selectsLeft(operator, conditionOutcome(left, evaluate, 0));
    if (selected === undefined) {
        return undefined;
    }
    return selected
        ? selectedValueSource(left, evaluate)
        : afterCondition(left, expression.getRight(), evaluate);
}

function emptyStatement(statement: Statement): boolean {
    return TypeScriptMorphNode.isEmptyStatement(statement) ||
        TypeScriptMorphNode.isBlock(statement) && statement.getStatements().every(emptyStatement);
}

function emptyDoSource(node: TypeScriptMorphNodeType, evaluate: SourceEvaluation): readonly SourcePart[] | undefined {
    if (!TypeScriptMorphNode.isDoStatement(node) || !emptyStatement(node.getStatement())) {
        return undefined;
    }
    const condition = evaluate.knownValue(node.getExpression());
    return condition !== undefined && !isTruthy(condition.value) ? [ ';' ] : undefined;
}

function pureStatementSource(
    statement: ExpressionStatement,
    evaluate: SourceEvaluation
): readonly SourcePart[] | undefined {
    const expression = statement.getExpression();
    if (TypeScriptMorphNode.isStringLiteral(expression)) {
        return undefined;
    }
    return evaluate.knownValue(expression) === undefined ? undefined : [ ';' ];
}

function replacementSource(
    node: TypeScriptMorphNodeType,
    evaluate: SourceEvaluation
): readonly SourcePart[] | undefined {
    if (TypeScriptMorphNode.isIfStatement(node)) {
        return constantBranchSource(node, evaluate);
    }
    if (TypeScriptMorphNode.isConditionalExpression(node)) {
        return conditionalSource(node, evaluate);
    }
    if (TypeScriptMorphNode.isBinaryExpression(node)) {
        return shortCircuitSource(node, evaluate);
    }
    if (TypeScriptMorphNode.isExpressionStatement(node)) {
        return pureStatementSource(node, evaluate);
    }
    return emptyDoSource(node, evaluate);
}

function controlFlowEdits(sourceFile: SourceFile): ReturnType<typeof sourceReplacement> {
    const evaluate = createSourceEvaluation(sourceFile);
    const edits: ReturnType<typeof sourceReplacement>[number][] = [];
    sourceFile.forEachDescendant(function (node, traversal) {
        const content = replacementSource(node, evaluate);
        if (content === undefined) {
            return;
        }
        edits.push(...sourceReplacement(node, content));
        traversal.skip();
    });
    return edits;
}

export function simplifyConstantControlFlow(preparation: SourcePreparation): void {
    const { sourceFile } = preparation;
    if (hasDynamicScope(sourceFile) || !runtimeSourceIsValid(sourceFile)) {
        return;
    }
    applySourcePreparation(preparation, controlFlowEdits);
    removeUnreachableStatements(preparation);
}
