import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { assertValidDeadCodeEliminationOutput } from '../test-libraries/dead-code-elimination-invariant-assertions.ts';
import {
    assertDeadCodeEliminationOutput,
    type DeadCodeEliminationCase
} from '../test-libraries/dead-code-elimination-output-assertions.ts';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { bundleForCodeFile, inputs } from '../test-libraries/eliminator-test-support.ts';
import { recursiveCallCases, type RecursiveCallCase } from '../test-libraries/recursive-call-cases.ts';
import { createProject } from '../test-libraries/typescript-project.ts';

function callFixture(input: RecursiveCallCase): DeadCodeEliminationCase {
    return {
        name: input.name,
        entry: {
            bundleName: 'package',
            targetFilePath: 'index.js',
            exportName: 'probe'
        },
        eliminationInputs: inputs(bundleForCodeFile({
            name: 'package',
            inputFilePath: '/source/index.js',
            targetFilePath: 'index.js',
            content: `${input.declarations}export const value=${input.expression};export function probe(){return ${
                input.value === undefined ? 'typeof value' : 'value'
            };}`
        }))
    };
}

suite('recursive call evaluation', function () {
    for (const input of recursiveCallCases) {
        test(`preserves ${input.name} in emitted code`, async function () {
            const fixture = callFixture(input);
            const verified = await assertDeadCodeEliminationOutput(fixture);
            assertValidDeadCodeEliminationOutput(fixture.name, verified.bundles);
            const [ output ] = verified.bundles;
            assertDefined(output);
            const calls = output.contents.flatMap(function (resource) {
                return createProject()
                    .createSourceFile('output.js', resource.fileDescription.content)
                    .getDescendantsOfKind(SyntaxKind.CallExpression);
            });
            assert.strictEqual(calls.length, input.remainingCalls);
        });
    }
});
