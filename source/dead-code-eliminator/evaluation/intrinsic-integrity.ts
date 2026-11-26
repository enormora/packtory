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
import { isAssignmentOperator } from '../assignment-operator.ts';
import { createSyntaxAnalysis, type SyntaxAnalysisResults } from '../../source-transformation/syntax-analysis.ts';
import { hasDynamicScope } from '../dynamic-scope.ts';
import { unwrapExpression } from '../expression-unwrapping.ts';
import { globalPathOf, globalPropertyKeyOf, type GlobalPath } from './global-path.ts';
import { createRuntimeSourceEvaluation, type SourceEvaluation } from './constant-evaluation.ts';
import type { IntrinsicIntegrity } from './evaluation-environment.ts';

type CallArguments = readonly TypeScriptMorphNodeType[];
type WrittenPaths = Iterable<GlobalPath>;

const wholeGlobalScope: GlobalPath = [];

const keyEvaluations = new WeakMap<SourceFile, SourceEvaluation>();

function evaluateKey(expression: Expression): string | undefined {
    const source = expression.getSourceFile();
    const evaluation = keyEvaluations.get(source) ?? createRuntimeSourceEvaluation(source);
    keyEvaluations.set(source, evaluation);
    const value = evaluation.primitiveValue(expression);
    return value === undefined ? undefined : String(value.value);
}

function pathOf(node: TypeScriptMorphNodeType | undefined): GlobalPath | undefined {
    return TypeScriptMorphNode.isExpression(node) ? globalPathOf(node, evaluateKey) : undefined;
}

function keyOf(node: TypeScriptMorphNodeType | undefined): string | undefined {
    return TypeScriptMorphNode.isExpression(node) ? globalPropertyKeyOf(node, evaluateKey) : undefined;
}

function withoutPrototypeLink(path: GlobalPath): GlobalPath {
    return path.at(-1) === '__proto__' ? path.slice(0, -1) : path;
}

function propertyTargetOf(property: ObjectLiteralElementLike): TypeScriptMorphNodeType | undefined {
    if (TypeScriptMorphNode.isPropertyAssignment(property)) {
        return property.getInitializerOrThrow();
    }
    if (TypeScriptMorphNode.isShorthandPropertyAssignment(property)) {
        return property.getNameNode();
    }
    return TypeScriptMorphNode.isSpreadAssignment(property) ? property.getExpression() : undefined;
}

function patternPartsOf(node: TypeScriptMorphNodeType): readonly (TypeScriptMorphNodeType | undefined)[] | undefined {
    return match<number>(node.getKind())
        .with(SyntaxKind.ArrayLiteralExpression, function () {
            return node.asKindOrThrow(SyntaxKind.ArrayLiteralExpression).getElements();
        })
        .with(SyntaxKind.ObjectLiteralExpression, function () {
            return node.asKindOrThrow(SyntaxKind.ObjectLiteralExpression).getProperties().map(propertyTargetOf);
        })
        .with(SyntaxKind.SpreadElement, function () {
            return [ node.asKindOrThrow(SyntaxKind.SpreadElement).getExpression() ];
        })
        .otherwise(constant(undefined));
}

function* writtenPathOf(target: TypeScriptMorphNodeType): WrittenPaths {
    const path = pathOf(target);
    if (path !== undefined) {
        yield withoutPrototypeLink(path);
    }
}

function* writtenPaths(target: TypeScriptMorphNodeType | undefined): WrittenPaths {
    if (target === undefined) {
        return;
    }
    const unwrapped = unwrapExpression(target);
    const parts = patternPartsOf(unwrapped);
    yield* parts === undefined ? writtenPathOf(unwrapped) : parts.flatMap(function (part) {
        return Array.from(writtenPaths(part));
    });
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

function* objectLiteralKeys(source: TypeScriptMorphNodeType): Iterable<string | undefined> {
    const unwrapped = unwrapExpression(source);
    if (TypeScriptMorphNode.isObjectLiteralExpression(unwrapped)) {
        yield* unwrapped.getProperties().map(literalPropertyKey);
    }
}

function* keyedTargetWrite(callArguments: CallArguments): WrittenPaths {
    const [ target, key ] = callArguments;
    const targetPath = pathOf(target);
    if (targetPath !== undefined) {
        yield [ ...targetPath, keyOf(key) ];
    }
}

function* propertySourcesWrite(callArguments: CallArguments): WrittenPaths {
    const [ target, ...sources ] = callArguments;
    const targetPath = pathOf(target);
    if (targetPath === undefined) {
        return;
    }
    for (const source of sources) {
        for (const key of objectLiteralKeys(source)) {
            yield [ ...targetPath, key ];
        }
    }
}

function* prototypeChainWrite(callArguments: CallArguments): WrittenPaths {
    const [ target ] = callArguments;
    const targetPath = pathOf(target);
    if (targetPath !== undefined) {
        yield targetPath;
    }
}

function* codeEvaluation(): WrittenPaths {
    yield wholeGlobalScope;
}

const callWrites: ReadonlyMap<string, (callArguments: CallArguments) => WrittenPaths> = new Map([
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

function* callWrittenPaths(call: CallExpression | NewExpression): WrittenPaths {
    const calleePath = pathOf(call.getExpression());
    const write = calleePath === undefined ? undefined : callWrites.get(calleePath.join('.'));
    if (write !== undefined) {
        yield* write(call.getArguments());
    }
}

function updatedOperand(node: TypeScriptMorphNodeType): TypeScriptMorphNodeType | undefined {
    if (TypeScriptMorphNode.isPrefixUnaryExpression(node) || TypeScriptMorphNode.isPostfixUnaryExpression(node)) {
        const operator = node.getOperatorToken();
        return operator === SyntaxKind.PlusPlusToken || operator === SyntaxKind.MinusMinusToken
            ? node.getOperand()
            : undefined;
    }
    return TypeScriptMorphNode.isDeleteExpression(node) ? node.getExpression() : undefined;
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

function patchedPathsAt(node: TypeScriptMorphNodeType): WrittenPaths {
    if (TypeScriptMorphNode.isCallExpression(node) || TypeScriptMorphNode.isNewExpression(node)) {
        return callWrittenPaths(node);
    }
    return writtenPaths(assignedTarget(node));
}

function scanSource(source: SourceFile): readonly GlobalPath[] {
    if (hasDynamicScope(source)) {
        return [ wholeGlobalScope ];
    }
    return source.forEachDescendantAsArray().flatMap(function (node) {
        return Array.from(patchedPathsAt(node));
    });
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
