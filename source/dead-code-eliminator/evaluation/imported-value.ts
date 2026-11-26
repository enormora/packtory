import {
    Node as TypeScriptMorphNode,
    type CallExpression,
    type Expression,
    type PropertyAccessExpression
} from 'ts-morph';
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
    return TypeScriptMorphNode.isPropertyAccessExpression(unwrapped)
        ? appendOriginPath(originOfTarget(unwrapped.getExpression(), context), unwrapped.getName())
        : resolveImportedExpressionPath(unwrapped) ?? evaluatedOrigin(unwrapped, context);
}

function memberOrigin(
    member: PropertyAccessExpression,
    context: EvaluationContext
): ImportedExpressionOrigin | undefined {
    return appendOriginPath(originOfTarget(member.getExpression(), context), member.getName());
}

export function importedMemberValue(
    expression: PropertyAccessExpression,
    context: EvaluationContext
): AbstractValue | undefined {
    const origin = memberOrigin(expression, context);
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

export function importedCallIsPure(call: CallExpression): boolean {
    const callee = call.getExpression();
    const origin = resolveImportedExpressionPropertyPath(callee);
    const environment = evaluationEnvironmentOf(call.getSourceFile());
    if (origin === undefined || originIsTrustedPureImport(origin, environment.settings)) {
        return origin !== undefined;
    }
    return exportPurity(origin, call, environment) === 'pure-callable' && shapeIsStable(callee, environment);
}
