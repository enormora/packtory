import { isDefined } from 'remeda';
import type { CallExpression, SourceFile } from 'ts-morph';
import type { SourceEvaluation } from './constant-evaluation.ts';
import type { FunctionEvaluation } from './function-evaluation.ts';
import { createModuleConstantReader } from './module-binding-evaluation.ts';
import { moduleCallable } from './module-callable.ts';
import type { ModuleValue } from './module-export-value.ts';
import type { EvaluatedValue } from './primitive-value.ts';

export function evaluateImportedCall(
    call: CallExpression,
    value: ModuleValue | undefined,
    evaluateSource: (source: SourceFile) => SourceEvaluation,
    evaluateFunction: (source: SourceFile) => FunctionEvaluation
): EvaluatedValue | undefined {
    if (value?.kind !== 'callable') {
        return undefined;
    }
    const target = moduleCallable(
        value.source.getFunction(value.name) ?? value.source.getVariableDeclaration(value.name)
    );
    if (target === undefined) {
        return undefined;
    }
    const evaluateArgument = evaluateSource(call.getSourceFile()).primitiveValue;
    const values = call.getArguments().map(evaluateArgument);
    return values.every(isDefined)
        ? evaluateFunction(target.getSourceFile()).callValue(
            target,
            values,
            createModuleConstantReader(target.getSourceFile(), evaluateSource(target.getSourceFile()))
        )
        : undefined;
}
