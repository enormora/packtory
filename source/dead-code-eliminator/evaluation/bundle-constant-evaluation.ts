import { Node as TypeScriptMorphNode, type Expression, type SourceFile } from 'ts-morph';
import type { ImportedExpressionOrigin } from '../imported-expression-origin.ts';
import type { RuntimeModuleResolver } from '../runtime-module-resolution.ts';
import { evaluateImportedConstant } from './imported-constant.ts';
import {
    createSourceEvaluation,
    createSourceEvaluations,
    type PrimitiveEvaluator,
    type SourceEvaluation
} from './constant-evaluation.ts';
import { createInitializedImportOrigin } from './initialized-import-origin.ts';
import { createFunctionEvaluation, type FunctionEvaluation } from './function-evaluation.ts';
import { evaluateImportedCall } from './imported-call-evaluation.ts';
import type { ModuleConstantSnapshot } from './module-constant-snapshot.ts';
import type { ModuleValue } from './module-export-value.ts';

type BundleConstantSnapshot = Pick<ModuleConstantSnapshot, 'resolveModule'> & {
    readonly modules: Pick<ModuleConstantSnapshot['modules'], 'get' | 'has'>;
};

function namespaceMember(
    value: ModuleValue | undefined,
    name: string | { readonly type: 'call-result'; },
    snapshot: BundleConstantSnapshot
): ModuleValue | undefined {
    const exports: ReadonlyMap<unknown, ModuleValue> | undefined = value?.kind === 'namespace'
        ? snapshot.modules.get(value.source)?.exports
        : undefined;
    return exports?.get(name);
}

function projectedValue(
    source: SourceFile,
    path: ImportedExpressionOrigin['path'],
    consumer: SourceFile,
    snapshot: BundleConstantSnapshot
): ModuleValue | undefined {
    if (snapshot.modules.get(consumer)?.initialized !== true) {
        return undefined;
    }
    return path.reduce<ModuleValue | undefined>(function (current, name) {
        return namespaceMember(current, name, snapshot);
    }, { kind: 'namespace', source });
}

function evaluateModuleValue(
    expression: Expression,
    value: ModuleValue | undefined,
    evaluateSource: (source: SourceFile) => SourceEvaluation,
    evaluateFunction: (source: SourceFile) => FunctionEvaluation
): ReturnType<PrimitiveEvaluator> {
    if (TypeScriptMorphNode.isCallExpression(expression)) {
        return evaluateImportedCall(expression, value, evaluateSource, evaluateFunction);
    }
    return value?.kind === 'constant' ? value.value : undefined;
}

export function createBundleConstantEvaluator(
    snapshot: BundleConstantSnapshot,
    resolveExternal: RuntimeModuleResolver
): PrimitiveEvaluator {
    const sourceEvaluation = createSourceEvaluations(createSourceEvaluation);
    const evaluateFunction = createSourceEvaluations(createFunctionEvaluation);
    const originFor = createInitializedImportOrigin(function (expression) {
        return sourceEvaluation(expression.getSourceFile()).primitiveValue(expression);
    });
    return function (expression) {
        const operand = TypeScriptMorphNode.isCallExpression(expression) ? expression.getExpression() : expression;
        const origin = originFor(operand);
        if (origin === undefined) {
            return undefined;
        }
        const source = snapshot.resolveModule(origin.from, operand.getSourceFile());
        return source !== undefined && snapshot.modules.has(source)
            ? evaluateModuleValue(
                expression,
                projectedValue(source, origin.path, expression.getSourceFile(), snapshot),
                sourceEvaluation,
                evaluateFunction
            )
            : evaluateImportedConstant(expression, resolveExternal);
    };
}
