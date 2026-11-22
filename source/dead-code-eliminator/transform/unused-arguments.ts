import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    ts,
    type CallExpression,
    type Expression,
    type ParameterDeclaration,
    type SourceFile
} from 'ts-morph';
import type { SourceTextEdit } from '../../source-transformation/text-edits.ts';
import { bindingHasOnlyUses } from '../binding-stability.ts';
import { createCallTargetResolver, runtimeParameters } from '../evaluation/call-target.ts';
import type { UnusedValueResolver } from '../evaluation/unused-value-effects.ts';

function parameterIsUnused(parameter: ParameterDeclaration | undefined): boolean {
    return parameter === undefined || parameter.getInitializer() === undefined &&
            bindingHasOnlyUses(parameter.getNameNode(), parameter, new Set());
}

function isPositionalArgument(argument: TypeScriptMorphNode): argument is Expression {
    return TypeScriptMorphNode.isExpression(argument) && !TypeScriptMorphNode.isSpreadElement(argument);
}

function trimArguments(call: CallExpression, lastRetained: Expression | undefined): SourceTextEdit {
    const start = lastRetained?.getEnd() ?? call.getFirstChildByKindOrThrow(SyntaxKind.OpenParenToken).getEnd();
    return { start, end: call.getFirstChildByKindOrThrow(SyntaxKind.CloseParenToken).getStart(), content: '' };
}

export function createUnusedArgumentReduction(
    source: SourceFile,
    resolveUnused: UnusedValueResolver
): (call: CallExpression) => readonly SourceTextEdit[] {
    const strictModule = ts.isExternalModule(source.compilerNode);
    const resolveTarget = createCallTargetResolver(source, function (target) {
        return TypeScriptMorphNode.isFunctionDeclaration(target) && target.getBody() !== undefined &&
            !target.getParameters().some(function (parameter) {
                return parameter.isRestParameter();
            }) && !target.getDescendantsOfKind(SyntaxKind.Identifier).some(function (identifier) {
                return identifier.compilerNode.text === 'arguments';
            });
    });
    return function (call) {
        const argumentsList = call.getArguments();
        if (!strictModule || argumentsList.length === 0 || !argumentsList.every(isPositionalArgument)) {
            return [];
        }
        const target = resolveTarget(call);
        if (target === undefined) {
            return [];
        }
        const parameters = runtimeParameters(target);
        const lastRetained = argumentsList.findLastIndex(function (argument, index) {
            return !parameterIsUnused(parameters[index]) || resolveUnused(argument)?.length !== 0;
        });
        return lastRetained === argumentsList.length - 1 ? [] : [ trimArguments(call, argumentsList[lastRetained]) ];
    };
}
