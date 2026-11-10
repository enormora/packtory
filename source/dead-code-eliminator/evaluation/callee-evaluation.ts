import { Node as TypeScriptMorphNode, type ParameterDeclaration } from 'ts-morph';
import { isPrimitiveResult, primitiveResult, type AbstractValue } from './abstract-value.ts';
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

type NumberIdentity = (value: number) => bigint;
type CallResults = {
    readonly argument: (value: PrimitiveValue) => CallResults;
    readonly evaluate: (invoke: () => AbstractValue | undefined) => AbstractValue | undefined;
};

function createNumberIdentity(): NumberIdentity {
    const encoded = new DataView(new ArrayBuffer(Float64Array.BYTES_PER_ELEMENT));
    return function (value) {
        encoded.setFloat64(0, value);
        return encoded.getBigUint64(0);
    };
}

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
    return values.every(isPrimitiveResult)
        ? values.map(function (value) {
            return value.value;
        })
        : undefined;
}

function createCallResults(numberIdentity: NumberIdentity): CallResults {
    const numericArguments = new Map<PrimitiveValue, CallResults>();
    const primitiveArgumentsByValue = new Map<PrimitiveValue, CallResults>();
    let result: EvaluatedValue | null = null;
    return {
        argument(value) {
            const numeric = typeof value === 'number';
            const argumentsToEvaluate = numeric ? numericArguments : primitiveArgumentsByValue;
            const key = numeric ? numberIdentity(value) : value;
            const next = argumentsToEvaluate.get(key) ?? createCallResults(numberIdentity);
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
    const numberIdentity = createNumberIdentity();
    return function (target, values, context) {
        const invoke = function (): AbstractValue | undefined {
            return evaluateIsolatedFunction(target, values, context);
        };
        const argumentsToEvaluate = primitiveArguments(values);
        if (argumentsToEvaluate === undefined) {
            return invoke();
        }
        const root = functions.get(target) ?? createCallResults(numberIdentity);
        functions.set(target, root);
        return argumentsToEvaluate
            .reduce(function (current, value) {
                return current.argument(value);
            }, root)
            .evaluate(invoke);
    };
}
