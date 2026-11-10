import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    ts,
    type CallExpression,
    type ElementAccessExpression,
    type Expression,
    type Node as TypeScriptMorphNodeType,
    type NonNullExpression,
    type PropertyAccessExpression
} from 'ts-morph';
import type { SourceTextEdit } from '../../source-transformation/text-edits.ts';
import type { SourcePreparation } from '../../source-transformation/source-preparation.ts';
import { createSourceEvaluation } from '../evaluation/constant-evaluation.ts';
import type { EvaluatedValue } from '../evaluation/primitive-value.ts';

type OptionalChain = CallExpression | ElementAccessExpression | NonNullExpression | PropertyAccessExpression;
type PrimitiveEvaluator = (expression: Expression) => EvaluatedValue | undefined;

function optionalChain(node: TypeScriptMorphNodeType): OptionalChain | undefined {
    if (!ts.isOptionalChain(node.compilerNode)) {
        return undefined;
    }
    return node.asKind(SyntaxKind.CallExpression) ?? node.asKind(SyntaxKind.ElementAccessExpression) ??
        node.asKind(SyntaxKind.NonNullExpression) ?? node.asKind(SyntaxKind.PropertyAccessExpression);
}

function nullishValue(value: EvaluatedValue | undefined): boolean {
    return value !== undefined && (value.value === null || value.value === undefined);
}

function chainShortCircuits(expression: OptionalChain, evaluate: PrimitiveEvaluator): boolean {
    const base = expression.getExpression();
    const chainedBase = optionalChain(base);
    if (chainedBase !== undefined && chainShortCircuits(chainedBase, evaluate)) {
        return true;
    }
    return !TypeScriptMorphNode.isNonNullExpression(expression) && expression.hasQuestionDotToken() &&
        nullishValue(evaluate(base));
}

function continuesChain(expression: OptionalChain): boolean {
    const parent = expression.getParentOrThrow().compilerNode;
    return ts.isOptionalChain(parent) && parent.expression === expression.compilerNode;
}

function reductionFor(node: TypeScriptMorphNodeType, evaluate: PrimitiveEvaluator): SourceTextEdit | undefined {
    const expression = optionalChain(node);
    if (expression === undefined || continuesChain(expression) || !chainShortCircuits(expression, evaluate)) {
        return undefined;
    }
    return { start: expression.getStart(), end: expression.getEnd(), content: '(void 0)' };
}

export function reduceOptionalChains(preparation: SourcePreparation): void {
    const { sourceFile } = preparation;
    const evaluate = createSourceEvaluation(sourceFile).primitiveValue;
    let previousEnd = 0;
    const edits = sourceFile.getDescendants().flatMap(function (node) {
        if (node.getStart() < previousEnd) {
            return [];
        }
        const edit = reductionFor(node, evaluate);
        if (edit === undefined) {
            return [];
        }
        previousEnd = edit.end;
        return [ edit ];
    });
    if (edits.length > 0) {
        preparation.applyEdits(edits);
    }
}
