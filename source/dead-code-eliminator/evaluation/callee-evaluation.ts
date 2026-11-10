import { Node as TypeScriptMorphNode, type ParameterDeclaration } from 'ts-morph';
import { primitiveResult, type AbstractValue } from './abstract-value.ts';
import { parameterBindingIsStable, runtimeParameters, type LocalFunction } from './call-target.ts';
import {
    createBindingReference,
    createLocalScope,
    type Completion,
    type EvaluationContext
} from './evaluation-context.ts';
import { evaluated, type EvaluatedValue, type PrimitiveValue } from './primitive-value.ts';

export type CalleeEvaluation = (
    target: LocalFunction,
    argumentValues: readonly AbstractValue[],
    context: EvaluationContext
) => AbstractValue | undefined;

type NegativeZero = { readonly kind: 'negative-zero'; };
type ArgumentKey = NegativeZero | PrimitiveValue;
type CallResults = {
    readonly argument: (value: PrimitiveValue) => CallResults;
    readonly evaluate: (invoke: () => AbstractValue | undefined) => AbstractValue | undefined;
};

const negativeZero: NegativeZero = { kind: 'negative-zero' };

function bindParameter(parameter: ParameterDeclaration, value: AbstractValue, context: EvaluationContext): boolean {
    if (
        !TypeScriptMorphNode.isIdentifier(parameter.getNameNode()) || parameter.isRestParameter() ||
        parameter.getInitializer() !== undefined || !parameterBindingIsStable(parameter)
    ) {
        return false;
    }
    context.locals.set(parameter, createBindingReference(value, true));
    return true;
}

function bindParameters(
    target: LocalFunction,
    values: readonly AbstractValue[],
    context: EvaluationContext
): boolean {
    return runtimeParameters(target).every(function (parameter, index) {
        return bindParameter(parameter, values[index] ?? evaluated(undefined), context);
    });
}

function completionValue(completion: Completion | undefined): AbstractValue | undefined {
    if (completion === undefined) {
        return undefined;
    }
    if (completion.type === 'return') {
        return completion.value;
    }
    return completion.type === 'normal' ? evaluated(undefined) : undefined;
}

function invokeFunction(target: LocalFunction, context: EvaluationContext): AbstractValue | undefined {
    const body = target.getBody();
    if (body === undefined) {
        return undefined;
    }
    if (!TypeScriptMorphNode.isBlock(body)) {
        return TypeScriptMorphNode.isExpression(body) ? context.evaluate(body, context) : undefined;
    }
    return completionValue(context.execute(body, context));
}

function evaluateIsolatedFunction(
    target: LocalFunction,
    values: readonly AbstractValue[],
    context: EvaluationContext
): AbstractValue | undefined {
    const local = { ...context, locals: createLocalScope(new Map()), depth: context.depth + 1 };
    return bindParameters(target, values, local) ? invokeFunction(target, local) : undefined;
}

function primitiveArguments(values: readonly AbstractValue[]): readonly PrimitiveValue[] | undefined {
    const argumentsToEvaluate: PrimitiveValue[] = [];
    for (const value of values) {
        const primitive = primitiveResult(value);
        if (primitive === undefined) {
            return undefined;
        }
        argumentsToEvaluate.push(primitive.value);
    }
    return argumentsToEvaluate;
}

function createCallResults(): CallResults {
    const argumentsToEvaluate = new Map<ArgumentKey, CallResults>();
    let result: EvaluatedValue | null = null;
    return {
        argument(value) {
            const key = Object.is(value, -0) ? negativeZero : value;
            const next = argumentsToEvaluate.get(key) ?? createCallResults();
            argumentsToEvaluate.set(key, next);
            return next;
        },
        evaluate(invoke) {
            if (result !== null) {
                return result;
            }
            const value = invoke();
            result = primitiveResult(value) ?? null;
            return value;
        }
    };
}

export function createCalleeEvaluation(): CalleeEvaluation {
    const functions = new WeakMap<LocalFunction, CallResults>();
    return function (target, values, context) {
        const invoke = function (): AbstractValue | undefined {
            return evaluateIsolatedFunction(target, values, context);
        };
        const argumentsToEvaluate = primitiveArguments(values);
        if (argumentsToEvaluate === undefined) {
            return invoke();
        }
        const root = functions.get(target) ?? createCallResults();
        functions.set(target, root);
        return argumentsToEvaluate
            .reduce(function (current, value) {
                return current.argument(value);
            }, root)
            .evaluate(invoke);
    };
}
