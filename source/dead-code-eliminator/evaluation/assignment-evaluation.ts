import { match } from 'ts-pattern';
import { constant } from 'remeda';
import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    type BinaryExpression,
    type Expression,
    type PostfixUnaryExpression,
    type PrefixUnaryExpression
} from 'ts-morph';
import { unwrapExpression } from '../expression-unwrapping.ts';
import { bindingReference, type EvaluationContext } from './evaluation-context.ts';
import { evaluated } from './primitive-value.ts';
import {
    evaluateAbstractBinary,
    shortCircuitSelection,
    type AbstractValue,
    type EvaluationReference,
    type ShortCircuitSelection
} from './abstract-value.ts';
import { recordPropertyReference } from './record-evaluation.ts';

function compoundAssignmentOperator(operator: SyntaxKind): SyntaxKind | undefined {
    return match<number>(operator)
        .with(SyntaxKind.PlusEqualsToken, constant(SyntaxKind.PlusToken))
        .with(SyntaxKind.MinusEqualsToken, constant(SyntaxKind.MinusToken))
        .with(SyntaxKind.AsteriskEqualsToken, constant(SyntaxKind.AsteriskToken))
        .with(SyntaxKind.SlashEqualsToken, constant(SyntaxKind.SlashToken))
        .with(SyntaxKind.PercentEqualsToken, constant(SyntaxKind.PercentToken))
        .otherwise(constant(undefined));
}

function logicalAssignmentOperator(operator: SyntaxKind): SyntaxKind | undefined {
    return match<number>(operator)
        .with(SyntaxKind.AmpersandAmpersandEqualsToken, constant(SyntaxKind.AmpersandAmpersandToken))
        .with(SyntaxKind.BarBarEqualsToken, constant(SyntaxKind.BarBarToken))
        .with(SyntaxKind.QuestionQuestionEqualsToken, constant(SyntaxKind.QuestionQuestionToken))
        .otherwise(constant(undefined));
}

function evaluateReference(expression: Expression, context: EvaluationContext): EvaluationReference | undefined {
    if (!context.consume()) {
        return undefined;
    }
    const target = unwrapExpression(expression);
    return bindingReference(target, context) ?? recordPropertyReference(target, context);
}

function updateReference(reference: EvaluationReference, operator: SyntaxKind): AbstractValue | undefined {
    if (typeof reference.value.value !== 'number') {
        return undefined;
    }
    const delta = operator === SyntaxKind.PlusPlusToken ? 1 : -1;
    return reference.assign(evaluated(reference.value.value + delta));
}

export function evaluateUpdate(
    expression: PostfixUnaryExpression | PrefixUnaryExpression,
    context: EvaluationContext
): AbstractValue | undefined {
    const reference = evaluateReference(expression.getOperand(), context);
    if (reference === undefined) {
        return undefined;
    }
    const previous = reference.value;
    const next = updateReference(reference, expression.getOperatorToken());
    return next !== undefined && TypeScriptMorphNode.isPostfixUnaryExpression(expression) ? previous : next;
}

function writeReference(reference: EvaluationReference, result: AbstractValue | undefined): AbstractValue | undefined {
    return result === undefined ? undefined : reference.assign(result);
}

function compoundAssignmentValue(
    expression: BinaryExpression,
    reference: EvaluationReference,
    context: EvaluationContext
): AbstractValue | undefined {
    const operator = compoundAssignmentOperator(expression.getOperatorToken().getKind());
    if (operator === undefined) {
        return undefined;
    }
    const previous = reference.value;
    const right = context.evaluate(expression.getRight(), context);
    return writeReference(
        reference,
        right === undefined ? undefined : evaluateAbstractBinary(operator, previous, right)
    );
}

function logicalAssignmentValue(
    expression: BinaryExpression,
    reference: EvaluationReference,
    selection: ShortCircuitSelection | undefined,
    context: EvaluationContext
): AbstractValue | undefined {
    if (selection === 'right') {
        return writeReference(reference, context.evaluate(expression.getRight(), context));
    }
    return selection === 'left' ? reference.value : undefined;
}

export function evaluateAssignment(
    expression: BinaryExpression,
    context: EvaluationContext
): AbstractValue | undefined {
    const reference = evaluateReference(expression.getLeft(), context);
    if (reference === undefined) {
        return undefined;
    }
    const operator = expression.getOperatorToken().getKind();
    const logicalOperator = logicalAssignmentOperator(operator);
    if (logicalOperator !== undefined) {
        const selection = shortCircuitSelection(logicalOperator, reference.value);
        return logicalAssignmentValue(expression, reference, selection, context);
    }
    return operator === SyntaxKind.EqualsToken
        ? writeReference(reference, context.evaluate(expression.getRight(), context))
        : compoundAssignmentValue(expression, reference, context);
}
