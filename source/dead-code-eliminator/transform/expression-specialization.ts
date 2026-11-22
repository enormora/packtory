import {
    Node as TypeScriptMorphNode,
    type Expression,
    type Node as TypeScriptMorphNodeType,
    type SourceFile
} from 'ts-morph';
import type { SourceTextEdit } from '../../source-transformation/text-edits.ts';
import type { SourcePreparation } from '../../source-transformation/source-preparation.ts';
import { createRuntimeSourceEvaluation, type PrimitiveEvaluator } from '../evaluation/constant-evaluation.ts';
import type { EvaluatedValue } from '../evaluation/primitive-value.ts';
import { createPureCallResolver, type PureCallResolver } from '../evaluation/pure-local-call.ts';
import { createFunctionSpecialization } from './function-specialization.ts';
import { expressionIsWriteTarget } from './expression-write.ts';
import { primitiveSource } from './primitive-source.ts';
import { sourceReplacement } from './source-replacement.ts';

function editForExpression(
    expression: Expression,
    evaluate: (expression: Expression) => EvaluatedValue | undefined
): SourceTextEdit | undefined {
    const result = evaluate(expression);
    if (result === undefined) {
        return undefined;
    }
    const content = primitiveSource(result);
    return expression.getText() === content
        ? undefined
        : { start: expression.getStart(), end: expression.getEnd(), content: `(${content})` };
}

function identityExpressionEdits(expression: Expression, resolveCall: PureCallResolver): readonly SourceTextEdit[] {
    const returned = TypeScriptMorphNode.isCallExpression(expression)
        ? resolveCall(expression)?.returnedArgument
        : undefined;
    return returned === undefined ? [] : sourceReplacement(expression, [ '(0, ', returned, ')' ]);
}

function isSpecializableExpression(node: TypeScriptMorphNodeType): node is Expression {
    return TypeScriptMorphNode.isCallExpression(node) || TypeScriptMorphNode.isPropertyAccessExpression(node) ||
        TypeScriptMorphNode.isElementAccessExpression(node) || TypeScriptMorphNode.isBinaryExpression(node) ||
        TypeScriptMorphNode.isPrefixUnaryExpression(node) || TypeScriptMorphNode.isTypeOfExpression(node);
}

function valueSpecializationEdits(
    expression: TypeScriptMorphNodeType,
    evaluate: PrimitiveEvaluator,
    resolveCall: PureCallResolver,
    specializeFunction: ReturnType<typeof createFunctionSpecialization>
): readonly SourceTextEdit[] {
    const functionEdits = specializeFunction(expression);
    if (functionEdits.length > 0) {
        return functionEdits;
    }
    if (!isSpecializableExpression(expression) || expressionIsWriteTarget(expression)) {
        return [];
    }
    const edit = editForExpression(expression, evaluate);
    return edit === undefined ? identityExpressionEdits(expression, resolveCall) : [ edit ];
}

function expressionSpecializationEdits(sourceFile: SourceFile): readonly SourceTextEdit[] {
    const evaluate = createRuntimeSourceEvaluation(sourceFile).primitiveValue;
    const resolveCall = createPureCallResolver(sourceFile);
    const specializeFunction = createFunctionSpecialization(sourceFile);
    const changes: SourceTextEdit[] = [];
    sourceFile.forEachDescendant(function (expression, traversal) {
        const edits = valueSpecializationEdits(expression, evaluate, resolveCall, specializeFunction);
        if (edits.length === 0) {
            return;
        }
        changes.push(...edits);
        traversal.skip();
    });
    return changes;
}

export function specializeExpressions(preparation: SourcePreparation): void {
    preparation.applyEdits(expressionSpecializationEdits(preparation.sourceFile));
}
