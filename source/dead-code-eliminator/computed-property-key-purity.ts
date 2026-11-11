import {
    Node as TypeScriptMorphNode,
    type Expression,
    type Identifier
} from 'ts-morph';
import type { RuntimeModuleResolver } from './runtime-module-resolution.ts';
import { unwrapExpression } from './expression-unwrapping.ts';
import { constantDominatesRead } from './evaluation/constant-binding.ts';
import { createConstantEvaluator } from './evaluation/local-call.ts';
import { evaluateImportedConstant } from './evaluation/imported-constant.ts';

function constantKeyInitializer(expression: Identifier): Expression | undefined {
    const declaration = expression.getSymbol()?.getValueDeclaration();
    if (!TypeScriptMorphNode.isVariableDeclaration(declaration)) {
        return undefined;
    }
    return constantDominatesRead(declaration, expression) ? declaration.getInitializer() : undefined;
}

function primitiveExpressionKey(expression: Expression): string | undefined {
    const value = createConstantEvaluator(expression.getSourceFile(), new Map())(expression);
    return value === undefined ? undefined : String(value.value);
}

function localPropertyKey(expression: Expression | undefined): string | undefined {
    const unwrapped = unwrapExpression(expression);
    if (unwrapped === undefined) {
        return undefined;
    }
    if (!TypeScriptMorphNode.isIdentifier(unwrapped)) {
        return primitiveExpressionKey(unwrapped);
    }
    if (unwrapped.getText() === 'undefined' && unwrapped.getSymbolOrThrow().getDeclarations().length === 0) {
        return 'undefined';
    }
    return localPropertyKey(constantKeyInitializer(unwrapped));
}

export function resolveComputedPropertyKey(
    expression: Expression,
    resolveModule: RuntimeModuleResolver
): string | undefined {
    const local = localPropertyKey(expression);
    if (local !== undefined) {
        return local;
    }
    const imported = evaluateImportedConstant(expression, resolveModule);
    return imported === undefined ? undefined : String(imported.value);
}

export function computedPropertyNameIsPure(expression: Expression, resolveModule: RuntimeModuleResolver): boolean {
    return resolveComputedPropertyKey(expression, resolveModule) !== undefined;
}
