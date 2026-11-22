import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { eliminateDeadCodeAndAssertAllOutputValid } from '../test-libraries/dead-code-elimination-output-assertions.ts';
import { singleFileOracleCase } from '../test-libraries/dead-code-elimination-single-file-case.ts';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { createProject } from '../test-libraries/typescript-project.ts';

suite('unused arguments', function () {
    for (
        const { parameters, body, values, retained } of [
            { parameters: 'unused', body: 'console.log("called");', values: '{ unused: 42 }', retained: 0 },
            { parameters: 'unused', body: 'console.log("called");', values: '42,', retained: 0 },
            { parameters: 'value, unused', body: 'console.log(value);', values: 'input, { unused: 42 }', retained: 1 },
            { parameters: 'unused', body: 'console.log("called");', values: 'console.log(1), 42', retained: 1 },
            { parameters: 'unused', body: 'console.log("called");', values: 'missing', retained: 1 },
            {
                parameters: 'unused',
                body: 'console.log((() => argum\\u0065nts.length)());',
                values: '{ unused: 42 }',
                retained: 1
            },
            { parameters: 'unused', body: 'console.log(e\\u0076al("arguments.length"));', values: '42', retained: 1 },
            { parameters: 'unused = console.log(1)', body: 'console.log(2);', values: '42', retained: 1 },
            { parameters: '{ unused }', body: 'console.log(2);', values: 'null', retained: 1 },
            { parameters: '...values', body: 'console.log(values.length);', values: '42', retained: 1 },
            { parameters: 'unused', body: 'console.log("called");', values: '...[42]', retained: 1 },
            { parameters: 'value', body: 'console.log({ value });', values: '42', retained: 1 }
        ]
    ) {
        test(`retains ${retained} arguments for (${parameters}) with ${body} and ${values}`, async function () {
            const content = `function effect(${parameters}){${body}}export function probe(input){effect(${values});}`;
            const result = await eliminateDeadCodeAndAssertAllOutputValid(singleFileOracleCase(content, 'index.js'));
            const output = result[0]?.contents[0]?.fileDescription.content;
            assertDefined(output);
            const source = createProject().createSourceFile('output.js', output);
            const call = source.getDescendantsOfKind(SyntaxKind.CallExpression).find(function (candidate) {
                return candidate.getExpression().getText() === 'effect';
            });
            assertDefined(call);
            assert.strictEqual(call.getArguments().length, retained);
        });
    }
});
