import { Node as TypeScriptMorphNode, type Expression } from 'ts-morph';
import { constantStatement } from './evaluation/constant-binding.ts';
import { unwrapExpression } from './expression-unwrapping.ts';
import { declarationOf } from './evaluation/evaluation-context.ts';
import {
    callResultOrigin,
    resolveImportedExpressionPropertyPath,
    type ImportedExpressionOrigin
} from './imported-expression-origin.ts';
import { exportPurityForOrigin } from './liveness/external-purity-summary.ts';
import type { RuntimeModuleResolver } from './runtime-module-resolution.ts';

type TargetOriginResolver = (
    expression: Expression,
    seen: ReadonlySet<Expression>
) => ImportedExpressionOrigin | undefined;

function aliasInitializer(expression: Expression): Expression | undefined {
    const declaration = declarationOf(expression);
    if (!TypeScriptMorphNode.isVariableDeclaration(declaration)) {
        return undefined;
    }
    return constantStatement(declaration) === undefined
        ? undefined
        : declaration.getInitializer();
}

function inheritedTargetOrigin(
    expression: Expression,
    seen: ReadonlySet<Expression>,
    resolve: TargetOriginResolver
): ImportedExpressionOrigin | undefined {
    const initializer = aliasInitializer(expression);
    if (initializer !== undefined) {
        return resolve(initializer, seen);
    }
    if (
        !TypeScriptMorphNode.isPropertyAccessExpression(expression) && !TypeScriptMorphNode.isCallExpression(expression)
    ) {
        return undefined;
    }
    const base = resolve(expression.getExpression(), seen);
    if (base === undefined) {
        return undefined;
    }
    return TypeScriptMorphNode.isCallExpression(expression)
        ? callResultOrigin(base)
        : { from: base.from, path: [ ...base.path, expression.getName() ] };
}

function callTargetOrigin(expression: Expression, seen: ReadonlySet<Expression>): ImportedExpressionOrigin | undefined {
    const node = unwrapExpression(expression);
    if (seen.has(node)) {
        return undefined;
    }
    return resolveImportedExpressionPropertyPath(node) ??
        inheritedTargetOrigin(node, new Set([ ...seen, node ]), callTargetOrigin);
}

export function createRuntimeCallablePurityProof(
    resolveModule: RuntimeModuleResolver
): (expression: Expression) => boolean {
    return function (expression) {
        const origin = callTargetOrigin(expression, new Set());
        return origin !== undefined &&
            exportPurityForOrigin(origin, expression.getSourceFile(), resolveModule) === 'pure-callable';
    };
}
