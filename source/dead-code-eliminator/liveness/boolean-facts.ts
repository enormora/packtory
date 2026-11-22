import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    VariableDeclarationKind,
    type Expression,
    type BinaryExpression,
    type PrefixUnaryExpression,
    type Statement,
    type VariableDeclaration,
    type VariableStatement
} from 'ts-morph';
import { unwrapExpression } from '../expression-unwrapping.ts';

export type BooleanFacts = ReadonlyMap<string, boolean>;

type BooleanValueEvaluator = (expression: Expression, facts: BooleanFacts) => boolean | undefined;

function booleanEquality(kind: SyntaxKind, left: boolean, right: boolean): boolean | undefined {
    if (kind === SyntaxKind.EqualsEqualsEqualsToken) {
        return left === right;
    }
    return kind === SyntaxKind.ExclamationEqualsEqualsToken ? left !== right : undefined;
}

function binaryBooleanOperatorValue(kind: SyntaxKind, left: boolean, right: boolean): boolean | undefined {
    if (kind === SyntaxKind.AmpersandAmpersandToken) {
        return left && right;
    }
    if (kind === SyntaxKind.BarBarToken) {
        return left || right;
    }
    return booleanEquality(kind, left, right);
}

function binaryBooleanValue(
    binary: BinaryExpression,
    facts: BooleanFacts,
    evaluate: BooleanValueEvaluator
): boolean | undefined {
    const left = evaluate(binary.getLeft(), facts);
    const right = evaluate(binary.getRight(), facts);
    if (left === undefined || right === undefined) {
        return undefined;
    }
    return binaryBooleanOperatorValue(binary.getOperatorToken().getKind(), left, right);
}

function prefixBooleanValue(
    expression: PrefixUnaryExpression,
    facts: BooleanFacts,
    evaluate: BooleanValueEvaluator
): boolean | undefined {
    const operand = evaluate(expression.getOperand(), facts);
    return operand !== undefined && expression.getOperatorToken() === SyntaxKind.ExclamationToken
        ? !operand
        : undefined;
}

export function booleanValue(expression: Expression, facts: BooleanFacts): boolean | undefined {
    const unwrapped = unwrapExpression(expression);
    const kind = unwrapped.getKind();
    if (kind === SyntaxKind.TrueKeyword || kind === SyntaxKind.FalseKeyword) {
        return kind === SyntaxKind.TrueKeyword;
    }
    if (kind === SyntaxKind.Identifier) {
        return facts.get(unwrapped.getText());
    }
    if (kind === SyntaxKind.PrefixUnaryExpression) {
        return prefixBooleanValue(unwrapped.asKindOrThrow(SyntaxKind.PrefixUnaryExpression), facts, booleanValue);
    }
    return kind === SyntaxKind.BinaryExpression
        ? binaryBooleanValue(unwrapped.asKindOrThrow(SyntaxKind.BinaryExpression), facts, booleanValue)
        : undefined;
}

function collectBooleanFact(
    declaration: VariableDeclaration,
    facts: BooleanFacts
): readonly [string, boolean] | undefined {
    const nameNode = declaration.getNameNode();
    const initializer = declaration.getInitializer();
    if (initializer === undefined || !TypeScriptMorphNode.isIdentifier(nameNode)) {
        return undefined;
    }
    const value = booleanValue(initializer, facts);
    return value === undefined ? undefined : [ nameNode.getText(), value ];
}

function collectConstBooleanFacts(statement: VariableStatement, facts: BooleanFacts): BooleanFacts {
    if (statement.getDeclarationKind() !== VariableDeclarationKind.Const) {
        return facts;
    }
    return statement.getDeclarations().reduce(function extendBooleanFacts(nextFacts, declaration) {
        const fact = collectBooleanFact(declaration, nextFacts);
        if (fact === undefined) {
            return nextFacts;
        }
        const [ name, value ] = fact;
        nextFacts.set(name, value);
        return nextFacts;
    }, new Map(facts));
}

export function factsAfterStatement(statement: Statement, facts: BooleanFacts): BooleanFacts {
    return TypeScriptMorphNode.isVariableStatement(statement) ? collectConstBooleanFacts(statement, facts) : facts;
}
