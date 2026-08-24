import { Node as TsMorphNode, type CallExpression, type Expression } from 'ts-morph';
import {
    arePureCallArguments,
    resolveImportedExpressionPath,
    type ExpressionPurityChecker,
    type ImportedExpressionOrigin
} from '../imported-expression-origin.ts';
import { exportPurityForOrigin } from './external-purity-summary.ts';

type OriginResolver = (
    expression: Expression,
    recurse: ExpressionPurityChecker
) => ImportedExpressionOrigin | undefined;

function originForPureCall(
    expression: CallExpression,
    recurse: ExpressionPurityChecker,
    resolveOrigin: OriginResolver
): ImportedExpressionOrigin | undefined {
    const origin = resolveOrigin(expression.getExpression(), recurse);
    if (origin === undefined || !arePureCallArguments(expression.getArguments(), recurse)) {
        return undefined;
    }
    return exportPurityForOrigin(origin, expression.getSourceFile()) === 'pure-callable'
        ? origin
        : undefined;
}

function fluentOriginForCall(
    expression: Expression,
    recurse: ExpressionPurityChecker,
    resolveOrigin: OriginResolver
): ImportedExpressionOrigin | undefined {
    if (!TsMorphNode.isCallExpression(expression)) {
        return resolveImportedExpressionPath(expression);
    }
    return originForPureCall(expression, recurse, resolveOrigin);
}

function appendOriginPath(
    origin: ImportedExpressionOrigin | undefined,
    segment: string
): ImportedExpressionOrigin | undefined {
    return origin === undefined
        ? undefined
        : { from: origin.from, path: [ ...origin.path, segment ] };
}

function propertyAccessOrigin(
    expression: Expression,
    recurse: ExpressionPurityChecker,
    resolveOrigin: OriginResolver
): ImportedExpressionOrigin | undefined {
    if (!TsMorphNode.isPropertyAccessExpression(expression)) {
        return undefined;
    }
    return appendOriginPath(
        fluentOriginForCall(expression.getExpression(), recurse, resolveOrigin),
        expression.getName()
    );
}

function externalCalleeOrigin(
    expression: Expression,
    recurse: ExpressionPurityChecker
): ImportedExpressionOrigin | undefined {
    const directOrigin = resolveImportedExpressionPath(expression);
    if (directOrigin !== undefined) {
        return directOrigin;
    }
    return propertyAccessOrigin(expression, recurse, externalCalleeOrigin);
}

export function externalCallIsPure(
    expression: CallExpression,
    recurse: ExpressionPurityChecker
): boolean {
    return originForPureCall(expression, recurse, externalCalleeOrigin) !== undefined;
}
