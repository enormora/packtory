import { Node as TypeScriptMorphNode, type Expression, type CallExpression, type SourceFile } from 'ts-morph';
import { builderBodyIsPure, builderReturnExpression } from '../liveness/builder-return.ts';
import { unwrapExpression } from '../expression-unwrapping.ts';
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
export type PureCallResolver = (call: CallExpression) => PureCall | undefined;

function returnsSoleParameter(target: LocalFunction): boolean {
    const [ parameter, additional ] = runtimeParameters(target);
    const returned = unwrapExpression(builderReturnExpression(target));
    return parameter !== undefined && additional === undefined && !parameter.isRestParameter() &&
        TypeScriptMorphNode.isIdentifier(returned) && parameterBindingIsStable(parameter);
}

export function createPureCallResolver(sourceFile: SourceFile): PureCallResolver {
    const resolveTarget = createCallTargetResolver(sourceFile, builderBodyIsPure);
    return function (call) {
        const argumentsToEvaluate = call.getArguments();
        const target = resolveTarget(call);
        if (
            target === undefined || argumentsToEvaluate.some(TypeScriptMorphNode.isSpreadElement) ||
            !argumentsToEvaluate.every(TypeScriptMorphNode.isExpression)
        ) {
            return undefined;
        }
        return {
            arguments: argumentsToEvaluate,
            returnedArgument: argumentsToEvaluate.length === 1 && returnsSoleParameter(target)
                ? argumentsToEvaluate[0]
                : undefined
        };
    };
}
