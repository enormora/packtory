import type { Node as TypeScriptMorphNode, SourceFile } from 'ts-morph';
import { constantBinding, type ConstantBinding } from './imported-constant.ts';
import type { SourceEvaluation } from './constant-evaluation.ts';
import type { EvaluatedValue } from './primitive-value.ts';

export type ModuleBindingEvaluator = (declaration: TypeScriptMorphNode) => EvaluatedValue | undefined;
type BindingEvaluationDependencies = {
    readonly evaluateSource: (source: SourceFile) => SourceEvaluation;
    readonly initializesBinding: (declaration: ConstantBinding['declaration']) => boolean;
};

export function createModuleBindingEvaluator(dependencies: BindingEvaluationDependencies): ModuleBindingEvaluator {
    const values = new Map<TypeScriptMorphNode, EvaluatedValue | undefined>();
    const evaluations = new Map<SourceFile, SourceEvaluation>();
    function evaluateSource(source: SourceFile): SourceEvaluation {
        const evaluation = evaluations.get(source) ?? dependencies.evaluateSource(source);
        evaluations.set(source, evaluation);
        return evaluation;
    }
    return function (declaration) {
        if (values.has(declaration)) {
            return values.get(declaration);
        }
        const binding = constantBinding(declaration);
        if (binding === undefined || !dependencies.initializesBinding(binding.declaration)) {
            values.set(declaration, undefined);
            return undefined;
        }
        const value = evaluateSource(declaration.getSourceFile()).primitiveValue(binding.expression);
        values.set(declaration, value);
        return value;
    };
}
