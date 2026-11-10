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
    const parameters = runtimeParameters(target);
    if (parameters.length !== 1) {
        return false;
    }
    const returned = unwrapExpression(builderReturnExpression(target));
    if (!TypeScriptMorphNode.isIdentifier(returned)) {
        return false;
    }
    const declarations = returned.getSymbol()?.getDeclarations() ?? [];
    return parameters.every(function (parameter) {
        return !parameter.isRestParameter() && declarations.length === 1 && declarations[0] === parameter &&
            parameterBindingIsStable(parameter);
    });
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
