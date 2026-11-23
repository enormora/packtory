import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    ts,
    type CallExpression,
    type Expression,
    type ParameterDeclaration,
    type SourceFile
} from 'ts-morph';
import type { SourcePreparation } from '../../source-transformation/source-preparation.ts';
import type { SourceTextEdit } from '../../source-transformation/text-edits.ts';
import { bindingHasOnlyUses } from '../binding-stability.ts';
import { createCallTargetResolver, runtimeParameters, type LocalFunction } from '../evaluation/call-target.ts';
import { createUnusedValueResolver, type UnusedValueResolver } from '../evaluation/unused-value-effects.ts';
import type { ExpressionPurityChecker } from '../imported-expression-origin.ts';

function parameterIsUnused(parameter: ParameterDeclaration | undefined): boolean {
    if (parameter === undefined) {
        return true;
    }
    const name = parameter.getNameNode();
    return parameter.getInitializer() === undefined && bindingHasOnlyUses(name, parameter, new Set());
}

function isPositionalArgument(argument: TypeScriptMorphNode): argument is Expression {
    return TypeScriptMorphNode.isExpression(argument) && !TypeScriptMorphNode.isSpreadElement(argument);
}

function trimArguments(call: CallExpression, lastRetained: Expression | undefined): SourceTextEdit {
    const start = lastRetained?.getEnd() ?? call.getFirstChildByKindOrThrow(SyntaxKind.OpenParenToken).getEnd();
    return { start, end: call.getFirstChildByKindOrThrow(SyntaxKind.CloseParenToken).getStart(), content: '' };
}

function ignoresArgumentList(target: LocalFunction): boolean {
    if (!TypeScriptMorphNode.isFunctionDeclaration(target) || target.getBody() === undefined) {
        return false;
    }
    return target.getParameters().every(function (parameter) {
        return !parameter.isRestParameter();
    }) && target.getDescendantsOfKind(SyntaxKind.Identifier).every(function (identifier) {
        return identifier.compilerNode.text !== 'arguments';
    });
}

function unusedArgumentEdits(
    source: SourceFile,
    resolveUnused: UnusedValueResolver
): (call: CallExpression) => readonly SourceTextEdit[] {
    const resolveTarget = createCallTargetResolver(source, ignoresArgumentList);
    return function (call) {
        const supplied = call.getArguments();
        const argumentsList = supplied.filter(isPositionalArgument);
        if (argumentsList.length === 0 || argumentsList.length !== supplied.length) {
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

export function removeUnusedArguments(preparation: SourcePreparation, isPure: ExpressionPurityChecker): void {
    const { sourceFile } = preparation;
    if (!ts.isExternalModule(sourceFile.compilerNode)) {
        return;
    }
    const editsForCall = unusedArgumentEdits(sourceFile, createUnusedValueResolver(sourceFile, isPure));
    const edits: SourceTextEdit[] = [];
    sourceFile.forEachDescendant(function (node, traversal) {
        if (TypeScriptMorphNode.isCallExpression(node)) {
            const removed = editsForCall(node);
            if (removed.length > 0) {
                edits.push(...removed);
                traversal.skip();
            }
        }
    });
    if (edits.length > 0) {
        preparation.applyEdits(edits);
    }
}
