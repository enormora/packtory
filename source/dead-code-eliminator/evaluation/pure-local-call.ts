import {
    Node as TypeScriptMorphNode,
    type Expression,
    type CallExpression,
    type NewExpression,
    type SourceFile
} from 'ts-morph';
import { builderBodyIsPure, builderReturnExpression } from '../liveness/builder-return.ts';
import { unwrapExpression } from '../expression-unwrapping.ts';
import { hasPureCallAnnotation } from '../call-annotation.ts';
import {
    createCallTargetResolver,
    parameterBindingIsStable,
    runtimeParameters,
    type LocalFunction
} from './call-target.ts';

type PureCall = {
    readonly arguments: readonly Expression[];
    readonly returnedArgument: Expression | undefined;
};
export type PureCallResolver = (call: CallExpression | NewExpression) => PureCall | undefined;

function returnsSoleParameter(target: LocalFunction): boolean {
    const [ parameter, additional ] = runtimeParameters(target);
    const returned = unwrapExpression(builderReturnExpression(target));
    return parameter !== undefined && additional === undefined && !parameter.isRestParameter() &&
        TypeScriptMorphNode.isIdentifier(returned) && parameterBindingIsStable(parameter);
}

function returnedIdentityArgument(
    target: LocalFunction | undefined,
    argumentsToEvaluate: readonly Expression[]
): Expression | undefined {
    if (target === undefined || argumentsToEvaluate.length !== 1) {
        return undefined;
    }
    return returnsSoleParameter(target) ? argumentsToEvaluate[0] : undefined;
}

export function createPureCallResolver(sourceFile: SourceFile): PureCallResolver {
    const resolveTarget = createCallTargetResolver(sourceFile, builderBodyIsPure);
    return function (call) {
        const argumentsToEvaluate = call.getArguments();
        const target = TypeScriptMorphNode.isCallExpression(call) ? resolveTarget(call) : undefined;
        if (
            target === undefined && !hasPureCallAnnotation(call) ||
            argumentsToEvaluate.some(TypeScriptMorphNode.isSpreadElement) ||
            !argumentsToEvaluate.every(TypeScriptMorphNode.isExpression)
        ) {
            return undefined;
        }
        return {
            arguments: argumentsToEvaluate,
            returnedArgument: returnedIdentityArgument(target, argumentsToEvaluate)
        };
    };
}
