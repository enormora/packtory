import type { Node as TypeScriptMorphNode, SourceFile, Identifier } from 'ts-morph';
import { constantBinding, type ConstantBinding } from './imported-constant.ts';
import { createSourceEvaluations, type SourceEvaluation } from './constant-evaluation.ts';
import { intrinsicUndefined } from './constant-binding.ts';
import { declarationOf, type EvaluationContext } from './evaluation-context.ts';
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

function ownModuleConstant(identifier: Identifier, source: SourceFile): ConstantBinding | undefined {
    const declaration = declarationOf(identifier);
    const binding = declaration === undefined ? undefined : constantBinding(declaration);
    return binding?.declaration.getSourceFile() === source ? binding : undefined;
}

export function createModuleConstantReader(
    source: SourceFile,
    evaluate: SourceEvaluation
): EvaluationContext['readConstant'] {
    const values = new Map<TypeScriptMorphNode, EvaluatedValue | undefined>();
    return function (identifier) {
        if (intrinsicUndefined(identifier)) {
            return { value: undefined };
        }
        const binding = ownModuleConstant(identifier, source);
        if (binding === undefined) {
            return undefined;
        }
        if (!values.has(binding.declaration)) {
            values.set(binding.declaration, evaluate.primitiveValue(binding.expression));
        }
        return values.get(binding.declaration);
    };
}
