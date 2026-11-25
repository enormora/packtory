import { Node as TypeScriptMorphNode, type CallExpression, type Expression } from 'ts-morph';
import { expressionBindingShapeIsStable } from '../binding-stability.ts';
import { unwrapExpression } from '../expression-unwrapping.ts';
import {
    callResultOrigin,
    originIsTrustedPureImport,
    resolveImportedExpressionPath,
    resolveImportedExpressionPropertyPath,
    type ImportedExpressionOrigin
} from '../imported-expression-origin.ts';
import {
    exportHasPureObjectReturnForOrigin,
    exportPurityForOrigin,
    type ExportPurity
} from '../liveness/external-purity-summary.ts';
import { createRuntimeCallablePurityProof } from '../runtime-call-purity.ts';
import { importedResult, opaqueResult, originOf, type AbstractValue } from './abstract-value.ts';
import type { EvaluationContext } from './evaluation-context.ts';
import { evaluationEnvironmentOf, type EvaluationEnvironment } from './evaluation-environment.ts';

function shapeIsStable(expression: Expression, environment: EvaluationEnvironment): boolean {
    return expressionBindingShapeIsStable(
        expression,
        createRuntimeCallablePurityProof(environment.resolveRuntimeModule)
    );
}

function exportPurity(
    origin: ImportedExpressionOrigin,
    expression: Expression,
    environment: EvaluationEnvironment
): ExportPurity {
    return exportPurityForOrigin(origin, expression.getSourceFile(), environment.resolveRuntimeModule);
}

function exportedResult(
    origin: ImportedExpressionOrigin,
    purity: ExportPurity
): AbstractValue {
    return importedResult(purity === 'pure-callable' ? 'callable' : 'object', origin);
}

function summarizedImportValue(
    origin: ImportedExpressionOrigin,
    identifier: Expression,
    environment: EvaluationEnvironment
): AbstractValue {
    const purity = exportPurity(origin, identifier, environment);
    return purity === 'unknown' ? opaqueResult('value') : exportedResult(origin, purity);
}

export function importedBindingValue(identifier: Expression): AbstractValue | undefined {
    const origin = resolveImportedExpressionPath(identifier);
    if (origin === undefined) {
        return undefined;
    }
    const environment = evaluationEnvironmentOf(identifier.getSourceFile());
    return originIsTrustedPureImport(origin, environment.settings)
        ? importedResult('object', origin)
        : summarizedImportValue(origin, identifier, environment);
}

function appendOriginPath(
    origin: ImportedExpressionOrigin | undefined,
    segment: string
): ImportedExpressionOrigin | undefined {
    return origin === undefined ? undefined : { from: origin.from, path: [ ...origin.path, segment ] };
}

function evaluatedOrigin(expression: Expression, context: EvaluationContext): ImportedExpressionOrigin | undefined {
    const value = context.evaluate(expression, context);
    return value === undefined ? undefined : originOf(value);
}

function originOfTarget(expression: Expression, context: EvaluationContext): ImportedExpressionOrigin | undefined {
    const unwrapped = unwrapExpression(expression);
    if (!TypeScriptMorphNode.isPropertyAccessExpression(unwrapped)) {
        return resolveImportedExpressionPropertyPath(unwrapped) ?? evaluatedOrigin(unwrapped, context);
    }
    const base = unwrapped.getExpression();
    const baseOrigin = TypeScriptMorphNode.isPropertyAccessExpression(unwrapExpression(base))
        ? originOfTarget(base, context)
        : resolveImportedExpressionPropertyPath(base) ?? evaluatedOrigin(base, context);
    return appendOriginPath(baseOrigin, unwrapped.getName());
}

export function importedMemberValue(expression: Expression, context: EvaluationContext): AbstractValue | undefined {
    const origin = originOfTarget(expression, context);
    if (origin === undefined) {
        return undefined;
    }
    const environment = evaluationEnvironmentOf(expression.getSourceFile());
    if (originIsTrustedPureImport(origin, environment.settings)) {
        return importedResult('object', origin);
    }
    const purity = exportPurity(origin, expression, environment);
    if (purity === 'unknown' || !shapeIsStable(expression, environment)) {
        return undefined;
    }
    return exportedResult(origin, purity);
}

export function importedCallValue(call: CallExpression, context: EvaluationContext): AbstractValue | undefined {
    const origin = originOfTarget(call.getExpression(), context);
    if (origin === undefined) {
        return undefined;
    }
    const environment = evaluationEnvironmentOf(call.getSourceFile());
    if (originIsTrustedPureImport(origin, environment.settings)) {
        return importedResult('object', callResultOrigin(origin));
    }
    if (
        exportPurity(origin, call, environment) !== 'pure-callable' || !shapeIsStable(call.getExpression(), environment)
    ) {
        return undefined;
    }
    const returnsPureObject = exportHasPureObjectReturnForOrigin(
        origin,
        call.getSourceFile(),
        environment.resolveRuntimeModule
    );
    return returnsPureObject ? importedResult('object', callResultOrigin(origin)) : opaqueResult('value');
}
