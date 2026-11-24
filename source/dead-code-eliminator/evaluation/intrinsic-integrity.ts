import { constant } from 'remeda';
import { match } from 'ts-pattern';
import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    type CallExpression,
    type Expression,
    type NewExpression,
    type Node as TypeScriptMorphNodeType,
    type ObjectLiteralElementLike,
    type SourceFile
} from 'ts-morph';
import { createSyntaxAnalysis, type SyntaxAnalysisResults } from '../../source-transformation/syntax-analysis.ts';
import { hasDynamicScope } from '../dynamic-scope.ts';
import { unwrapExpression } from '../expression-unwrapping.ts';
import { globalPathOf, globalPropertyKeyOf, type GlobalPath } from './global-path.ts';
import { createRuntimeSourceEvaluation, type SourceEvaluation } from './constant-evaluation.ts';
import type { IntrinsicIntegrity } from './evaluation-environment.ts';

type CallArguments = readonly (Expression | undefined)[];

const wholeGlobalScope: GlobalPath = [];

const keyEvaluations = new WeakMap<SourceFile, SourceEvaluation>();

function evaluateKey(expression: Expression): string | undefined {
    const source = expression.getSourceFile();
    const evaluation = keyEvaluations.get(source) ?? createRuntimeSourceEvaluation(source);
    keyEvaluations.set(source, evaluation);
    const value = evaluation.primitiveValue(expression);
    return value === undefined ? undefined : String(value.value);
}

function pathOf(expression: Expression): GlobalPath | undefined {
    return globalPathOf(expression, evaluateKey);
}

function keyOf(expression: Expression): string | undefined {
    return globalPropertyKeyOf(expression, evaluateKey);
}

function isAssignmentOperator(kind: SyntaxKind): boolean {
    return kind >= SyntaxKind.FirstAssignment && kind <= SyntaxKind.LastAssignment;
}

function withoutPrototypeLink(path: GlobalPath): GlobalPath {
    return path.at(-1) === '__proto__' ? path.slice(0, -1) : path;
}

function propertyTargetsOf(property: ObjectLiteralElementLike): readonly TypeScriptMorphNodeType[] {
    if (TypeScriptMorphNode.isPropertyAssignment(property)) {
        return [ property.getInitializerOrThrow() ];
    }
    if (TypeScriptMorphNode.isShorthandPropertyAssignment(property)) {
        return [ property.getNameNode() ];
    }
    return TypeScriptMorphNode.isSpreadAssignment(property) ? [ property.getExpression() ] : [];
}

function defaultedTargetOf(expression: Expression): readonly TypeScriptMorphNodeType[] | undefined {
    const binary = expression.asKindOrThrow(SyntaxKind.BinaryExpression);
    return binary.getOperatorToken().getKind() === SyntaxKind.EqualsToken ? [ binary.getLeft() ] : undefined;
}

function patternPartsOf(expression: Expression): readonly TypeScriptMorphNodeType[] | undefined {
    return match<number>(expression.getKind())
        .with(SyntaxKind.ArrayLiteralExpression, function () {
            return expression.asKindOrThrow(SyntaxKind.ArrayLiteralExpression).getElements();
        })
        .with(SyntaxKind.ObjectLiteralExpression, function () {
            return expression.asKindOrThrow(SyntaxKind.ObjectLiteralExpression).getProperties().flatMap(
                propertyTargetsOf
            );
        })
        .with(SyntaxKind.SpreadElement, function () {
            return [ expression.asKindOrThrow(SyntaxKind.SpreadElement).getExpression() ];
        })
        .with(SyntaxKind.BinaryExpression, function () {
            return defaultedTargetOf(expression);
        })
        .otherwise(constant(undefined));
}

function writtenPaths(target: TypeScriptMorphNodeType): readonly GlobalPath[] {
    if (!TypeScriptMorphNode.isExpression(target)) {
        return [];
    }
    const unwrapped = unwrapExpression(target);
    const parts = patternPartsOf(unwrapped);
    if (parts !== undefined) {
        return parts.flatMap(writtenPaths);
    }
    const path = pathOf(unwrapped);
    return path === undefined ? [] : [ withoutPrototypeLink(path) ];
}

function literalPropertyKey(property: ObjectLiteralElementLike): string | undefined {
    if (TypeScriptMorphNode.isSpreadAssignment(property)) {
        return undefined;
    }
    const name = property.getNameNode();
    if (TypeScriptMorphNode.isComputedPropertyName(name)) {
        return keyOf(name.getExpression());
    }
    if (TypeScriptMorphNode.isStringLiteral(name) || TypeScriptMorphNode.isNumericLiteral(name)) {
        return String(name.getLiteralValue());
    }
    return TypeScriptMorphNode.isIdentifier(name) ? name.getText() : undefined;
}

function keyedTargetWrite(callArguments: CallArguments): readonly GlobalPath[] {
    const [ target, key ] = callArguments;
    const targetPath = target === undefined ? undefined : pathOf(target);
    const propertyKey = key === undefined ? undefined : keyOf(key);
    return targetPath === undefined || propertyKey === undefined ? [] : [ [ ...targetPath, propertyKey ] ];
}

function propertySourcesWrite(callArguments: CallArguments): readonly GlobalPath[] {
    const [ target, ...sources ] = callArguments;
    const targetPath = target === undefined ? undefined : pathOf(target);
    if (targetPath === undefined) {
        return [];
    }
    return sources.flatMap(function (source) {
        const unwrapped = unwrapExpression(source);
        if (!TypeScriptMorphNode.isObjectLiteralExpression(unwrapped)) {
            return [];
        }
        return unwrapped.getProperties().flatMap(function (property) {
            const key = literalPropertyKey(property);
            return key === undefined ? [] : [ [ ...targetPath, key ] ];
        });
    });
}

function prototypeChainWrite(callArguments: CallArguments): readonly GlobalPath[] {
    const [ target ] = callArguments;
    const targetPath = target === undefined ? undefined : pathOf(target);
    return targetPath === undefined ? [] : [ targetPath ];
}

function codeEvaluation(): readonly GlobalPath[] {
    return [ wholeGlobalScope ];
}

const callWrites: ReadonlyMap<string, (callArguments: CallArguments) => readonly GlobalPath[]> = new Map([
    [ 'Object.defineProperty', keyedTargetWrite ],
    [ 'Reflect.defineProperty', keyedTargetWrite ],
    [ 'Reflect.set', keyedTargetWrite ],
    [ 'Reflect.deleteProperty', keyedTargetWrite ],
    [ 'Object.defineProperties', propertySourcesWrite ],
    [ 'Object.assign', propertySourcesWrite ],
    [ 'Object.setPrototypeOf', prototypeChainWrite ],
    [ 'Reflect.setPrototypeOf', prototypeChainWrite ],
    [ 'eval', codeEvaluation ],
    [ 'Function', codeEvaluation ]
]);

function callArgumentsOf(call: CallExpression | NewExpression): CallArguments {
    return call.getArguments().map(function (argument) {
        return TypeScriptMorphNode.isExpression(argument) && !TypeScriptMorphNode.isSpreadElement(argument)
            ? argument
            : undefined;
    });
}

function callWrittenPaths(call: CallExpression | NewExpression): readonly GlobalPath[] {
    const calleePath = pathOf(call.getExpression());
    const write = calleePath === undefined ? undefined : callWrites.get(calleePath.join('.'));
    return write === undefined ? [] : write(callArgumentsOf(call));
}

function updatedOperand(node: TypeScriptMorphNodeType): TypeScriptMorphNodeType | undefined {
    if (TypeScriptMorphNode.isPrefixUnaryExpression(node) || TypeScriptMorphNode.isPostfixUnaryExpression(node)) {
        const operator = node.getOperatorToken();
        return operator === SyntaxKind.PlusPlusToken || operator === SyntaxKind.MinusMinusToken
            ? node.getOperand()
            : undefined;
    }
    if (TypeScriptMorphNode.isDeleteExpression(node)) {
        return node.getExpression();
    }
    return undefined;
}

function assignedTarget(node: TypeScriptMorphNodeType): TypeScriptMorphNodeType | undefined {
    if (TypeScriptMorphNode.isBinaryExpression(node) && isAssignmentOperator(node.getOperatorToken().getKind())) {
        return node.getLeft();
    }
    if (TypeScriptMorphNode.isForOfStatement(node) || TypeScriptMorphNode.isForInStatement(node)) {
        return node.getInitializer();
    }
    return updatedOperand(node);
}

function patchedPathsAt(node: TypeScriptMorphNodeType): readonly GlobalPath[] {
    if (TypeScriptMorphNode.isCallExpression(node) || TypeScriptMorphNode.isNewExpression(node)) {
        return callWrittenPaths(node);
    }
    const target = assignedTarget(node);
    return target === undefined ? [] : writtenPaths(target);
}

function scanSource(source: SourceFile): readonly GlobalPath[] {
    if (hasDynamicScope(source)) {
        return [ wholeGlobalScope ];
    }
    return source.forEachDescendantAsArray().flatMap(patchedPathsAt);
}

const patchedPathResults: SyntaxAnalysisResults<readonly GlobalPath[]> = new WeakMap();

function patchedPathsIn(source: SourceFile): readonly GlobalPath[] {
    return createSyntaxAnalysis(scanSource, patchedPathResults)(source);
}

function isPrefixOf(prefix: GlobalPath, path: GlobalPath): boolean {
    return prefix.length <= path.length && prefix.every(function (segment, index) {
        return path[index] === segment;
    });
}

export function scanIntrinsicIntegrity(sources: readonly SourceFile[]): IntrinsicIntegrity {
    const patched = sources.flatMap(patchedPathsIn);
    return {
        isIntact(path) {
            return patched.every(function (patchedPath) {
                return !isPrefixOf(patchedPath, path);
            });
        }
    };
}
