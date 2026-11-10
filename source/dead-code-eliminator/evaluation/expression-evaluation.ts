import { match } from 'ts-pattern';
import { constant, isTruthy } from 'remeda';
import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    type Expression,
    type BinaryExpression,
    type PrefixUnaryExpression,
    type PostfixUnaryExpression,
    type Node as TypeScriptMorphNodeType
} from 'ts-morph';
import { unwrapExpression } from '../expression-unwrapping.ts';
import { bindingReference, type EvaluationContext } from './evaluation-context.ts';
import {
    evaluated,
    numericLiteralValue,
    shortCircuitValue,
    type EvaluatedValue
} from './primitive-value.ts';
import {
    evaluateAbstractBinary,
    evaluateAbstractUnary,
    type AbstractValue,
    type EvaluationReference
} from './abstract-value.ts';
import { evaluateRecordExpression, recordPropertyReference } from './record-evaluation.ts';

function compoundAssignmentOperator(operator: SyntaxKind): SyntaxKind | undefined {
    return match(operator)
        .with(SyntaxKind.PlusEqualsToken, constant(SyntaxKind.PlusToken))
        .with(SyntaxKind.MinusEqualsToken, constant(SyntaxKind.MinusToken))
        .with(SyntaxKind.AsteriskEqualsToken, constant(SyntaxKind.AsteriskToken))
        .with(SyntaxKind.SlashEqualsToken, constant(SyntaxKind.SlashToken))
        .with(SyntaxKind.PercentEqualsToken, constant(SyntaxKind.PercentToken))
        .otherwise(constant(undefined));
}

function logicalAssignmentOperator(operator: SyntaxKind): SyntaxKind | undefined {
    return match(operator)
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

function literalValue(expression: Expression): EvaluatedValue | undefined {
    if (TypeScriptMorphNode.isBigIntLiteral(expression)) {
        return evaluated(BigInt(expression.compilerNode.text.slice(0, -1)));
    }
    if (TypeScriptMorphNode.isNumericLiteral(expression)) {
        return evaluated(numericLiteralValue(expression));
    }
    if (
        TypeScriptMorphNode.isStringLiteral(expression) ||
        TypeScriptMorphNode.isNoSubstitutionTemplateLiteral(expression)
    ) {
        return evaluated(expression.getLiteralValue());
    }
    const keywordValues = new Map<SyntaxKind, EvaluatedValue>([
        [ SyntaxKind.TrueKeyword, evaluated(true) ],
        [ SyntaxKind.FalseKeyword, evaluated(false) ],
        [ SyntaxKind.NullKeyword, evaluated(null) ]
    ]);
    return keywordValues.get(expression.getKind());
}

function updateReference(reference: EvaluationReference, operator: SyntaxKind): AbstractValue | undefined {
    if (typeof reference.value.value !== 'number') {
        return undefined;
    }
    const delta = operator === SyntaxKind.PlusPlusToken ? 1 : -1;
    return reference.assign(evaluated(reference.value.value + delta));
}

function updateValue(
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

function unaryValue(expression: Expression, context: EvaluationContext): AbstractValue | undefined {
    if (TypeScriptMorphNode.isPostfixUnaryExpression(expression)) {
        return updateValue(expression, context);
    }
    if (!TypeScriptMorphNode.isPrefixUnaryExpression(expression)) {
        return undefined;
    }
    const operator = expression.getOperatorToken();
    if (operator === SyntaxKind.PlusPlusToken || operator === SyntaxKind.MinusMinusToken) {
        return updateValue(expression, context);
    }
    const operand = context.evaluate(expression.getOperand(), context);
    return operand === undefined ? undefined : evaluateAbstractUnary(operator, operand);
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

function assignmentSelectsLeft(operator: SyntaxKind, reference: EvaluationReference): boolean {
    const logicalOperator = logicalAssignmentOperator(operator);
    return shortCircuitValue(logicalOperator, reference.value.value) === true;
}

function assignmentValue(expression: BinaryExpression, context: EvaluationContext): AbstractValue | undefined {
    const reference = evaluateReference(expression.getLeft(), context);
    if (reference === undefined) {
        return undefined;
    }
    const operator = expression.getOperatorToken().getKind();
    if (assignmentSelectsLeft(operator, reference)) {
        return reference.value;
    }
    return operator === SyntaxKind.EqualsToken || logicalAssignmentOperator(operator) !== undefined
        ? writeReference(reference, context.evaluate(expression.getRight(), context))
        : compoundAssignmentValue(expression, reference, context);
}

function binaryOperandsValue(expression: BinaryExpression, context: EvaluationContext): AbstractValue | undefined {
    const left = context.evaluate(expression.getLeft(), context);
    if (left === undefined) {
        return undefined;
    }
    const shortCircuit = shortCircuitValue(expression.getOperatorToken().getKind(), left.value);
    if (shortCircuit === true) {
        return left;
    }
    const right = context.evaluate(expression.getRight(), context);
    if (shortCircuit === false || right === undefined) {
        return right;
    }
    return evaluateAbstractBinary(expression.getOperatorToken().getKind(), left, right);
}

function binaryValue(expression: BinaryExpression, context: EvaluationContext): AbstractValue | undefined {
    const operator = expression.getOperatorToken().getKind();
    return operator >= SyntaxKind.FirstAssignment && operator <= SyntaxKind.LastAssignment
        ? assignmentValue(expression, context)
        : binaryOperandsValue(expression, context);
}

function branchingValue(expression: Expression, context: EvaluationContext): AbstractValue | undefined {
    if (TypeScriptMorphNode.isCallExpression(expression)) {
        return context.call(expression, context);
    }
    if (!TypeScriptMorphNode.isConditionalExpression(expression)) {
        return undefined;
    }
    const condition = context.evaluate(expression.getCondition(), context);
    if (condition === undefined) {
        return undefined;
    }
    return context.evaluate(isTruthy(condition.value) ? expression.getWhenTrue() : expression.getWhenFalse(), context);
}

function keywordUnaryValue(expression: Expression, context: EvaluationContext): EvaluatedValue | undefined {
    if (!TypeScriptMorphNode.isVoidExpression(expression) && !TypeScriptMorphNode.isTypeOfExpression(expression)) {
        return undefined;
    }
    const operand = context.evaluate(expression.getExpression(), context);
    if (operand === undefined) {
        return undefined;
    }
    return evaluated(TypeScriptMorphNode.isTypeOfExpression(expression) ? typeof operand.value : undefined);
}

function valueWithoutMutation(expression: Expression, context: EvaluationContext): AbstractValue | undefined {
    return literalValue(expression) ?? branchingValue(expression, context) ?? keywordUnaryValue(expression, context) ??
        evaluateRecordExpression(expression, context);
}

function expressionValue(node: Expression, context: EvaluationContext): AbstractValue | undefined {
    if (TypeScriptMorphNode.isIdentifier(node)) {
        return bindingReference(node, context)?.value ?? context.readConstant(node);
    }
    if (TypeScriptMorphNode.isBinaryExpression(node)) {
        return binaryValue(node, context);
    }
    return valueWithoutMutation(node, context) ?? unaryValue(node, context);
}

export function evaluateExpression(
    expression: TypeScriptMorphNodeType,
    context: EvaluationContext
): AbstractValue | undefined {
    return context.consume() && TypeScriptMorphNode.isExpression(expression)
        ? expressionValue(unwrapExpression(expression), context)
        : undefined;
}
