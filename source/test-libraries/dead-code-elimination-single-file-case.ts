import assert from 'node:assert';
import { SyntaxKind } from 'ts-morph';
import { createSourceEvaluation } from '../dead-code-eliminator/evaluation/constant-evaluation.ts';
import type { EvaluatedValue } from '../dead-code-eliminator/evaluation/primitive-value.ts';
import {
    assertDeadCodeEliminationEquivalent,
    eliminateDeadCodeAndAssertAllOutputValid,
    observeDeadCodeEliminationBehavior,
    type DeadCodeEliminationOracleCase
} from './dead-code-elimination-oracle-test-support.ts';
import { inputs, bundleForCodeFile } from './eliminator-test-support.ts';
import { assertDefined, assertDeepSubset } from './deep-subset-assertion.ts';
import { createProject } from './typescript-project.ts';

export type SingleFileEvaluationCase = {
    readonly name: string;
    readonly content: string;
    readonly result: EvaluatedValue | undefined;
    readonly native: unknown;
    readonly remainingCalls: number;
};

type CallReductionCase = {
    readonly content: string;
    readonly targetFilePath: string;
    readonly callee: string | null;
    readonly remainingCalls: number;
};

export function singleFileOracleCase(content: string, targetFilePath: string): DeadCodeEliminationOracleCase {
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

export async function assertSingleFileCallReduction(input: CallReductionCase): Promise<void> {
    const fixture = singleFileOracleCase(input.content, input.targetFilePath);
    await assertDeadCodeEliminationEquivalent(fixture);
    const result = await eliminateDeadCodeAndAssertAllOutputValid(fixture);
    const output = result[0]?.contents[0]?.fileDescription.content;
    assertDefined(output);
    const source = createProject().createSourceFile('output.js', output);
    const remaining = source.getDescendantsOfKind(SyntaxKind.CallExpression).filter(function (call) {
        return input.callee === null || call.getExpression().getText() === input.callee;
    });
    assert.strictEqual(remaining.length, input.remainingCalls);
}

export async function assertSingleFileEvaluation(input: SingleFileEvaluationCase): Promise<void> {
    const source = createProject().createSourceFile('input.ts', input.content);
    const expression = source.getVariableDeclarationOrThrow('value').getInitializerOrThrow();
    assert.deepStrictEqual(createSourceEvaluation(source).primitiveValue(expression), input.result);
    const content = `${input.content}export function probe(){return value;}`;
    const fixture = singleFileOracleCase(content, 'index.js');
    const native = await observeDeadCodeEliminationBehavior({
        name: input.name,
        entry: fixture.entry,
        bundles: fixture.eliminationInputs.map(function (entry) {
            return entry.bundle;
        })
    });
    assertDeepSubset(native[0]?.result.observation, input.native);
    await assertSingleFileCallReduction({
        content,
        targetFilePath: 'index.js',
        callee: null,
        remainingCalls: input.remainingCalls
    });
}
