import { Node as TypeScriptMorphNode, type Expression } from 'ts-morph';
import { hasProp } from 'remeda';
import { collectBindingDependencies } from './exports/binding-dependencies.ts';
import { constantStatement } from './evaluation/constant-binding.ts';
import { unwrapExpression } from './expression-unwrapping.ts';
import { declarationOf } from './evaluation/evaluation-context.ts';
import {
    callResultPath,
    resolveImportedExpressionPropertyPath,
    type ImportedExpressionOrigin
} from './imported-expression-origin.ts';
import { exportPurityForOrigin } from './liveness/external-purity-summary.ts';
import type { RuntimeModuleResolver } from './runtime-module-resolution.ts';

type TargetOriginStep = {
    readonly expression: Expression;
    readonly path: ImportedExpressionOrigin['path'];
};

function aliasInitializer(expression: Expression): Expression | undefined {
    const declaration = declarationOf(expression);
    if (!TypeScriptMorphNode.isVariableDeclaration(declaration)) {
        return undefined;
    }
    return constantStatement(declaration) === undefined
        ? undefined
        : declaration.getInitializer();
}

function inheritedTargetStep(expression: Expression): TargetOriginStep | undefined {
    const initializer = aliasInitializer(expression);
    if (initializer !== undefined) {
        return { expression: initializer, path: [] };
    }
    if (TypeScriptMorphNode.isPropertyAccessExpression(expression)) {
        return { expression: expression.getExpression(), path: [ expression.getName() ] };
    }
    return TypeScriptMorphNode.isCallExpression(expression)
        ? { expression: expression.getExpression(), path: callResultPath([]) }
        : undefined;
}

function callTargetOrigin(expression: Expression): ImportedExpressionOrigin | undefined {
    const suffix = Array.of<ImportedExpressionOrigin['path']>();
    const leaves = collectBindingDependencies<Expression | ImportedExpressionOrigin>(unwrapExpression(expression), {
        get(node) {
            return hasProp(node, 'from') ? undefined : function* () {
                const origin = resolveImportedExpressionPropertyPath(node);
                if (origin !== undefined) {
                    yield origin;
                    return;
                }
                const step = inheritedTargetStep(node);
                if (step !== undefined) {
                    suffix.push(step.path);
                    yield unwrapExpression(step.expression);
                }
            };
        }
    });
    const origin = leaves.find(function (leaf) {
        return hasProp(leaf, 'from');
    });
    return origin === undefined
        ? undefined
        : { from: origin.from, path: [ ...origin.path, ...suffix.toReversed().flat() ] };
}

export function createRuntimeCallablePurityProof(
    resolveModule: RuntimeModuleResolver
): (expression: Expression) => boolean {
    return function (expression) {
        const origin = callTargetOrigin(expression);
        return origin !== undefined &&
            exportPurityForOrigin(origin, expression.getSourceFile(), resolveModule) === 'pure-callable';
    };
}
