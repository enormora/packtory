import assert from 'node:assert';
import { SyntaxKind } from 'ts-morph';
import { createSourceEvaluation } from '../dead-code-eliminator/evaluation/constant-evaluation.ts';
import type { ExpressionEvaluationCase } from './expression-evaluation-case.ts';
import {
    type DeadCodeEliminationCase,
    assertDeadCodeEliminationOutput,
    type VerifiedDeadCodeElimination
} from './dead-code-elimination-output-assertions.ts';

import { assertDefined } from './deep-subset-assertion.ts';
import { bundleForCodeFile, inputs } from './eliminator-test-support.ts';
import { createProject } from './typescript-project.ts';

export type SingleFileEvaluationCase = ExpressionEvaluationCase & {
    readonly remainingCalls: number;
};
type CallReductionCase = {
    readonly content: string;
    readonly targetFilePath: string;
    readonly callee: string | null;
    readonly remainingCalls: number;
};
export function singleFileOracleCase(content: string, targetFilePath: string): DeadCodeEliminationCase {
    return {
        name: 'single-file',
        entry: {
            bundleName: 'package',
            targetFilePath,
            exportName: targetFilePath.endsWith('.cjs') ? 'default' : 'probe'
        },
        eliminationInputs: inputs(bundleForCodeFile({
            name: 'package',
            inputFilePath: `/source/${targetFilePath}`,
            targetFilePath,
            content
        }))
    };
}
async function verifySingleFileCallReduction(input: CallReductionCase): Promise<VerifiedDeadCodeElimination> {
    const fixture = singleFileOracleCase(input.content, input.targetFilePath);
    const result = await assertDeadCodeEliminationOutput(fixture);
    const output = result.bundles[0]?.contents[0]?.fileDescription.content;
    assertDefined(output);
    const source = createProject().createSourceFile('output.js', output);
    const remaining = source.getDescendantsOfKind(SyntaxKind.CallExpression).filter(function (call) {
        return input.callee === null || call.getExpression().getText() === input.callee;
    });
    assert.strictEqual(remaining.length, input.remainingCalls);
    return result;
}
export async function assertSingleFileCallReduction(input: CallReductionCase): Promise<void> {
    await verifySingleFileCallReduction(input);
}
export async function assertSingleFileEvaluation(input: SingleFileEvaluationCase): Promise<void> {
    const source = createProject().createSourceFile('input.ts', input.content);
    const expression = source.getVariableDeclarationOrThrow('value').getInitializerOrThrow();
    assert.deepStrictEqual(createSourceEvaluation(source).primitiveValue(expression), input.result);
    const content = `${input.content}export function probe(){return value;}`;
    await verifySingleFileCallReduction({
        content,
        targetFilePath: 'index.js',
        callee: null,
        remainingCalls: input.remainingCalls
    });
}
