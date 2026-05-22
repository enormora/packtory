import { Node as TsMorphNode, SyntaxKind, type CallExpression, type Expression, type NewExpression } from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../config/dead-code-elimination-settings.ts';
import { unwrapExpression } from './expression-unwrapping.ts';
import {
    arePureCallArguments,
    resolveImportedExpressionOrigin,
    type ExpressionPurityChecker
} from './imported-expression-origin.ts';
import {
    allowedBinaryOperators,
    allowedPrefixUnaryOperators,
    inherentlyPurePropertyKinds,
    pureLeafKinds
} from './syntax-kind-sets.ts';

type PurityRule = (
    expression: Expression,
    recurse: ExpressionPurityChecker,
    settings: DeadCodeEliminationSettings | undefined
) => boolean;

function isPureArrayElement(element: Expression, recurse: ExpressionPurityChecker): boolean {
    if (TsMorphNode.isOmittedExpression(element)) {
        return true;
    }
    if (TsMorphNode.isSpreadElement(element)) {
        return recurse(element.getExpression());
    }
    return recurse(element);
}

function isPurePropertyAssignment(property: TsMorphNode, recurse: ExpressionPurityChecker): boolean {
    if (TsMorphNode.isPropertyAssignment(property)) {
        return recurse(property.getInitializerOrThrow());
    }
    if (TsMorphNode.isSpreadAssignment(property)) {
        return recurse(property.getExpression());
    }
    return inherentlyPurePropertyKinds.has(property.getKind());
}

function isPureBuiltinCallExpression(
    callTarget: Expression,
    expression: CallExpression,
    recurse: ExpressionPurityChecker
): boolean {
    return TsMorphNode.isIdentifier(callTarget) && callTarget.getText() === 'Symbol'
        ? arePureCallArguments(expression.getArguments(), recurse)
        : false;
}

function isPureCallExpression(
    expression: CallExpression,
    recurse: ExpressionPurityChecker,
    settings: DeadCodeEliminationSettings | undefined
): boolean {
    const callTarget = unwrapExpression(expression.getExpression());
    return (
        isPureBuiltinCallExpression(callTarget, expression, recurse) ||
        resolveImportedExpressionOrigin(expression, recurse, settings) !== undefined
    );
}

function isPureNewExpression(
    expression: NewExpression,
    recurse: ExpressionPurityChecker,
    settings: DeadCodeEliminationSettings | undefined
): boolean {
    const constructorExpression = unwrapExpression(expression.getExpression());
    const pureConstructors = settings?.pureConstructors;
    return (
        TsMorphNode.isIdentifier(constructorExpression) &&
        pureConstructors !== undefined &&
        pureConstructors.includes(constructorExpression.getText()) &&
        arePureCallArguments(expression.getArguments(), recurse)
    );
}

const expressionPurityRules: ReadonlyMap<SyntaxKind, PurityRule> = new Map<SyntaxKind, PurityRule>([
    [
        SyntaxKind.TemplateExpression,
        (expression, recurse) => {
            return expression
                .asKindOrThrow(SyntaxKind.TemplateExpression)
                .getTemplateSpans()
                .every((span) => {
                    return recurse(span.getExpression());
                });
        }
    ],
    [
        SyntaxKind.ArrayLiteralExpression,
        (expression, recurse) => {
            return expression
                .asKindOrThrow(SyntaxKind.ArrayLiteralExpression)
                .getElements()
                .every((element) => {
                    return isPureArrayElement(element, recurse);
                });
        }
    ],
    [
        SyntaxKind.ObjectLiteralExpression,
        (expression, recurse) => {
            return expression
                .asKindOrThrow(SyntaxKind.ObjectLiteralExpression)
                .getProperties()
                .every((property) => {
                    return isPurePropertyAssignment(property, recurse);
                });
        }
    ],
    [
        SyntaxKind.PrefixUnaryExpression,
        (expression, recurse) => {
            const unary = expression.asKindOrThrow(SyntaxKind.PrefixUnaryExpression);
            return allowedPrefixUnaryOperators.has(unary.getOperatorToken()) && recurse(unary.getOperand());
        }
    ],
    [
        SyntaxKind.BinaryExpression,
        (expression, recurse) => {
            const binary = expression.asKindOrThrow(SyntaxKind.BinaryExpression);
            if (!allowedBinaryOperators.has(binary.getOperatorToken().getKind())) {
                return false;
            }
            return recurse(binary.getLeft()) && recurse(binary.getRight());
        }
    ],
    [
        SyntaxKind.CallExpression,
        (expression, recurse, settings) => {
            return isPureCallExpression(expression.asKindOrThrow(SyntaxKind.CallExpression), recurse, settings);
        }
    ],
    [
        SyntaxKind.NewExpression,
        (expression, recurse, settings) => {
            return isPureNewExpression(expression.asKindOrThrow(SyntaxKind.NewExpression), recurse, settings);
        }
    ]
]);

export function isPureExpression(expression: Expression, settings: DeadCodeEliminationSettings | undefined): boolean {
    const unwrapped = unwrapExpression(expression);
    const recurse: ExpressionPurityChecker = (candidate) => {
        return isPureExpression(candidate, settings);
    };
    const kind = unwrapped.getKind();
    if (pureLeafKinds.has(kind)) {
        return true;
    }
    return expressionPurityRules.get(kind)?.(unwrapped, recurse, settings) ?? false;
}
