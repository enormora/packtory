import { Node as TypeScriptMorphNode, type CallExpression, type Expression } from 'ts-morph';
import type { PurityContext } from './purity-context.ts';
import { unwrapExpression } from './expression-unwrapping.ts';
import { expressionBindingShapeIsStable } from './binding-stability.ts';
import { createRuntimeCallablePurityProof } from './runtime-call-purity.ts';
import {
    expressionFactOrigin,
    pureCallableWithOrigin,
    pureObjectWithOrigin,
    pureValueFact,
    purityCheckerFor,
    unknownFact,
    type ExpressionFact,
    type ExpressionFactResolver
} from './expression-facts.ts';
import {
    arePureCallArguments,
    callResultOrigin,
    originIsTrustedPureImport,
    resolveImportedExpressionPropertyPath,
    type ImportedExpressionOrigin
} from './imported-expression-origin.ts';
import { exportHasPureObjectReturnForOrigin, exportPurityForOrigin } from './liveness/external-purity-summary.ts';

function appendOriginPath(
    origin: ImportedExpressionOrigin | undefined,
    segment: string
): ImportedExpressionOrigin | undefined {
    return origin === undefined ? undefined : { from: origin.from, path: [ ...origin.path, segment ] };
}

function originForExpressionFact(
    expression: Expression,
    factFor: ExpressionFactResolver
): ImportedExpressionOrigin | undefined {
    return expressionFactOrigin(factFor(expression));
}

export function originForCallTarget(
    expression: Expression,
    factFor: ExpressionFactResolver,
    context: PurityContext
): ImportedExpressionOrigin | undefined {
    const unwrapped = unwrapExpression(expression);
    if (TypeScriptMorphNode.isPropertyAccessExpression(unwrapped)) {
        const base = unwrapped.getExpression();
        const baseOrigin = TypeScriptMorphNode.isPropertyAccessExpression(unwrapExpression(base))
            ? originForCallTarget(base, factFor, context)
            : resolveImportedExpressionPropertyPath(base) ?? originForExpressionFact(base, factFor);
        return appendOriginPath(baseOrigin, unwrapped.getName());
    }
    return resolveImportedExpressionPropertyPath(unwrapped) ?? originForExpressionFact(unwrapped, factFor);
}

function externalCallResultFact(
    origin: ImportedExpressionOrigin,
    expression: CallExpression,
    context: PurityContext
): ExpressionFact {
    if (
        !expressionBindingShapeIsStable(
            expression.getExpression(),
            createRuntimeCallablePurityProof(context.resolveRuntimeModule)
        )
    ) {
        return unknownFact;
    }
    if (exportPurityForOrigin(origin, expression.getSourceFile(), context.resolveRuntimeModule) !== 'pure-callable') {
        return unknownFact;
    }
    return exportHasPureObjectReturnForOrigin(origin, expression.getSourceFile(), context.resolveRuntimeModule)
        ? pureObjectWithOrigin(callResultOrigin(origin))
        : pureValueFact;
}

export function importedCallResultFact(
    origin: ImportedExpressionOrigin | undefined,
    expression: CallExpression,
    factFor: ExpressionFactResolver,
    context: PurityContext
): ExpressionFact {
    if (origin === undefined || !arePureCallArguments(expression.getArguments(), purityCheckerFor(factFor))) {
        return unknownFact;
    }
    if (originIsTrustedPureImport(origin, context.settings)) {
        return pureObjectWithOrigin(callResultOrigin(origin));
    }
    return externalCallResultFact(origin, expression, context);
}

function externalPropertyAccessFact(
    origin: ImportedExpressionOrigin,
    expression: Expression,
    context: PurityContext
): ExpressionFact {
    if (!expressionBindingShapeIsStable(expression, createRuntimeCallablePurityProof(context.resolveRuntimeModule))) {
        return unknownFact;
    }
    const exportPurity = exportPurityForOrigin(origin, expression.getSourceFile(), context.resolveRuntimeModule);
    if (exportPurity === 'pure-callable') {
        return pureCallableWithOrigin(origin);
    }
    return exportPurity === 'pure-object' ? pureObjectWithOrigin(origin) : unknownFact;
}

export function propertyAccessExpressionFact(
    expression: Expression,
    factFor: ExpressionFactResolver,
    context: PurityContext
): ExpressionFact {
    const origin = originForCallTarget(expression, factFor, context);
    if (origin === undefined) {
        return unknownFact;
    }
    return originIsTrustedPureImport(origin, context.settings)
        ? pureObjectWithOrigin(origin)
        : externalPropertyAccessFact(origin, expression, context);
}
