import assert from 'node:assert';
import { Node as TypeScriptMorphNode, SyntaxKind, type Expression, type SourceFile } from 'ts-morph';
import { createSourceEvaluation } from '../dead-code-eliminator/evaluation/constant-evaluation.ts';
import type { EvaluatedValue } from '../dead-code-eliminator/evaluation/primitive-value.ts';
import { assertDefined } from './deep-subset-assertion.ts';
import { createProject } from './typescript-project.ts';

export type ExpressionEvaluationCase = {
    readonly name: string;
    readonly content: string;
    readonly result: EvaluatedValue | undefined;
};
export type ReturnEvaluationCase = ExpressionEvaluationCase & {
    readonly discardable: boolean;
};

export function probeReturnExpression(source: SourceFile): Expression {
    const body = source.getFunctionOrThrow('probe').getBodyOrThrow().asKindOrThrow(SyntaxKind.Block);
    const statement = body.getStatements().find(TypeScriptMorphNode.isReturnStatement);
    assertDefined(statement);
    return statement.getExpressionOrThrow();
}

export function assertReturnEvaluation(input: ReturnEvaluationCase): void {
    const source = createProject().createSourceFile('input.js', input.content);
    const expression = probeReturnExpression(source);
    const unused = source.getVariableDeclaration('unused')?.getInitializer();
    const evaluation = createSourceEvaluation(source);
    assert.deepStrictEqual(evaluation.primitiveValue(expression), input.result);
    assert.strictEqual(evaluation.canDiscard(unused ?? expression), input.discardable);
    assert.strictEqual(source.getFullText(), input.content);
}

export function assertExpressionEvaluation(input: ExpressionEvaluationCase): void {
    const source = createProject().createSourceFile('input.ts', input.content);
    const expression = source.getVariableDeclarationOrThrow('value').getInitializerOrThrow();
    assert.deepStrictEqual(createSourceEvaluation(source).primitiveValue(expression), input.result);
    assert.strictEqual(source.getFullText(), input.content);
}
