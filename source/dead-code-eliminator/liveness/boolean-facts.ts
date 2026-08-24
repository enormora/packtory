import {
    Node as TsMorphNode,
    SyntaxKind,
    VariableDeclarationKind,
    type Expression,
    type Statement,
    type VariableDeclaration,
    type VariableStatement
} from 'ts-morph';
import { unwrapExpression } from '../expression-unwrapping.ts';

export type BooleanFacts = ReadonlyMap<string, boolean>;

type BooleanValueEvaluator = (expression: Expression, facts: BooleanFacts) => boolean | undefined;

function andOperator(left: boolean, right: boolean): boolean {
    return left && right;
}

function orOperator(left: boolean, right: boolean): boolean {
    return left || right;
}

function equalOperator(left: boolean, right: boolean): boolean {
    return left === right;
}

function notEqualOperator(left: boolean, right: boolean): boolean {
    return left !== right;
}

function literalBooleanValue(expression: Expression): boolean | undefined {
    if (expression.getKind() === SyntaxKind.TrueKeyword) {
        return true;
    }
    return expression.getKind() === SyntaxKind.FalseKeyword ? false : undefined;
}

function logicalBooleanOperatorValue(kind: SyntaxKind, left: boolean, right: boolean): boolean | undefined {
    if (kind === SyntaxKind.AmpersandAmpersandToken) {
        return andOperator(left, right);
    }
    if (kind === SyntaxKind.BarBarToken) {
        return orOperator(left, right);
    }
    return undefined;
}

function equalityBooleanOperatorValue(kind: SyntaxKind, left: boolean, right: boolean): boolean | undefined {
    if (kind === SyntaxKind.EqualsEqualsEqualsToken) {
        return equalOperator(left, right);
    }
    if (kind === SyntaxKind.ExclamationEqualsEqualsToken) {
        return notEqualOperator(left, right);
    }
    return undefined;
}

function binaryBooleanOperatorValue(kind: SyntaxKind, left: boolean, right: boolean): boolean | undefined {
    return logicalBooleanOperatorValue(kind, left, right) ?? equalityBooleanOperatorValue(kind, left, right);
}

function identifierBooleanValue(expression: Expression, facts: BooleanFacts): boolean | undefined {
    return TsMorphNode.isIdentifier(expression) ? facts.get(expression.getText()) : undefined;
}

function binaryBooleanValue(
    expression: Expression,
    facts: BooleanFacts,
    evaluate: BooleanValueEvaluator
): boolean | undefined {
    if (!TsMorphNode.isBinaryExpression(expression)) {
        return undefined;
    }
    const binary = expression.asKindOrThrow(SyntaxKind.BinaryExpression);
    const left = evaluate(binary.getLeft(), facts);
    const right = evaluate(binary.getRight(), facts);
    if (left === undefined || right === undefined) {
        return undefined;
    }
    return binaryBooleanOperatorValue(binary.getOperatorToken().getKind(), left, right);
}

function prefixBooleanValue(
    expression: Expression,
    facts: BooleanFacts,
    evaluate: BooleanValueEvaluator
): boolean | undefined {
    if (!TsMorphNode.isPrefixUnaryExpression(expression)) {
        return undefined;
    }
    const operand = evaluate(expression.getOperand(), facts);
    return operand !== undefined && expression.getOperatorToken() === SyntaxKind.ExclamationToken
        ? !operand
        : undefined;
}

export function booleanValue(expression: Expression, facts: BooleanFacts): boolean | undefined {
    const unwrapped = unwrapExpression(expression);
    return literalBooleanValue(unwrapped) ??
        identifierBooleanValue(unwrapped, facts) ??
        prefixBooleanValue(unwrapped, facts, booleanValue) ??
        binaryBooleanValue(unwrapped, facts, booleanValue);
}

function collectBooleanFact(
    declaration: VariableDeclaration,
    facts: BooleanFacts
): readonly [string, boolean] | undefined {
    const nameNode = declaration.getNameNode();
    const initializer = declaration.getInitializer();
    if (initializer === undefined || !TsMorphNode.isIdentifier(nameNode)) {
        return undefined;
    }
    const value = booleanValue(initializer, facts);
    return value === undefined ? undefined : [ nameNode.getText(), value ];
}

function collectConstBooleanFacts(statement: VariableStatement, facts: BooleanFacts): BooleanFacts {
    if (statement.getDeclarationKind() !== VariableDeclarationKind.Const) {
        return facts;
    }
    const nextFacts = new Map(facts);
    for (const declaration of statement.getDeclarations()) {
        const fact = collectBooleanFact(declaration, nextFacts);
        if (fact !== undefined) {
            const [ name, value ] = fact;
            nextFacts.set(name, value);
        }
    }
    return nextFacts;
}

export function factsAfterStatement(statement: Statement, facts: BooleanFacts): BooleanFacts {
    return TsMorphNode.isVariableStatement(statement) ? collectConstBooleanFacts(statement, facts) : facts;
}
