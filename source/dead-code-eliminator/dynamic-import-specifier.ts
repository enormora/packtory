import { Node as TypeScriptMorphNode, SyntaxKind, type CallExpression, type Expression } from 'ts-morph';
import { createSourceEvaluation } from './evaluation/constant-evaluation.ts';
import { hasDynamicScope } from './dynamic-scope.ts';

function computedSpecifier(argument: Expression): string | undefined {
    if (hasDynamicScope(argument.getSourceFile())) {
        return undefined;
    }
    const value = createSourceEvaluation(argument.getSourceFile()).primitiveValue(argument);
    return typeof value?.value === 'string' ? value.value : undefined;
}

export function dynamicImportSpecifier(call: CallExpression): string | undefined {
    if (call.getExpression().getKind() !== SyntaxKind.ImportKeyword) {
        return undefined;
    }
    const [ argument ] = call.getArguments();
    if (TypeScriptMorphNode.isStringLiteral(argument)) {
        return argument.getLiteralValue();
    }
    return TypeScriptMorphNode.isExpression(argument) ? computedSpecifier(argument) : undefined;
}
