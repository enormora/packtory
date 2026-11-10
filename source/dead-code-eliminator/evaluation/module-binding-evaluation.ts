import type { Node as TypeScriptMorphNode, SourceFile } from 'ts-morph';
import { constantBinding, type ConstantBinding } from './imported-constant.ts';
import { createSourceEvaluations, type SourceEvaluation } from './constant-evaluation.ts';
import type { EvaluatedValue } from './primitive-value.ts';

export type ModuleBindingEvaluator = (declaration: TypeScriptMorphNode) => EvaluatedValue | undefined;
type BindingEvaluationDependencies = {
    readonly evaluateSource: (source: SourceFile) => SourceEvaluation;
    readonly initializesBinding: (declaration: ConstantBinding['declaration']) => boolean;
};

export function createModuleBindingEvaluator(dependencies: BindingEvaluationDependencies): ModuleBindingEvaluator {
    const values = new Map<TypeScriptMorphNode, EvaluatedValue | undefined>();
    const evaluations = createSourceEvaluations(dependencies.evaluateSource);
    return function (declaration) {
        if (values.has(declaration)) {
            return values.get(declaration);
        }
        const binding = constantBinding(declaration);
        if (binding === undefined || !dependencies.initializesBinding(binding.declaration)) {
            values.set(declaration, undefined);
            return undefined;
        }
        const value = evaluations(declaration.getSourceFile()).primitiveValue(binding.expression);
        values.set(declaration, value);
        return value;
    };
}
