import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    assertSingleFileEvaluation,
    singleFileOracleCase,
    type SingleFileEvaluationCase
} from '../test-libraries/dead-code-elimination-single-file-case.ts';
import { eliminateDeadCodeAndAssertAllOutputValid } from '../test-libraries/dead-code-elimination-oracle-test-support.ts';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { createProject } from '../test-libraries/typescript-project.ts';

const cases: readonly SingleFileEvaluationCase[] = [
    {
        name: 'async nullish disposal retains its suspension',
        content: 'let seen=0;queueMicrotask(()=>{seen=1;});{await using resource=null;}export const value=seen;',
        result: undefined,
        native: { error: null, value: 1 },
        remainingCalls: 1
    },
    {
        name: 'module resource initialization error',
        content: 'using resource={};export const value=42;',
        result: { value: 42 },
        native: { error: { name: 'TypeError' } },
        remainingCalls: 0
    },
    {
        name: 'unused nullish module resource can disappear',
        content: 'using resource=null;export const value=42;',
        result: { value: 42 },
        native: { error: null, value: 42 },
        remainingCalls: 0
    },
    {
        name: 'pure acquisition retains module disposal',
        content: 'export let disposed=0;function create(){return {[Symbol.dispose](){disposed++;}};}' +
            'using resource=/* @__PURE__ */create();export const value=42;',
        result: { value: 42 },
        native: { error: null, value: 42 },
        remainingCalls: 1
    },
    {
        name: 'numeric resource initialization error',
        content: 'function compute(){using resource=1;return 42;}export const value=compute();',
        result: undefined,
        native: { error: { name: 'TypeError' } },
        remainingCalls: 1
    },
    {
        name: 'missing disposal method',
        content: 'function compute(){using resource={};return 42;}export const value=compute();',
        result: undefined,
        native: { error: { name: 'TypeError' } },
        remainingCalls: 1
    },
    {
        name: 'zero is not a nullish resource',
        content: 'function compute(){using resource=0;return 42;}export const value=compute();',
        result: undefined,
        native: { error: { name: 'TypeError' } },
        remainingCalls: 1
    },
    {
        name: 'false is not a nullish resource',
        content: 'function compute(){using resource=false;return 42;}export const value=compute();',
        result: undefined,
        native: { error: { name: 'TypeError' } },
        remainingCalls: 1
    },
    {
        name: 'empty string is not a nullish resource',
        content: 'function compute(){using resource="";return 42;}export const value=compute();',
        result: undefined,
        native: { error: { name: 'TypeError' } },
        remainingCalls: 1
    },
    {
        name: 'null resource has no disposal effects',
        content: 'function compute(){using resource=null;return 42;}export const value=compute();',
        result: { value: 42 },
        native: { error: null, value: 42 },
        remainingCalls: 0
    },
    {
        name: 'undefined resource has no disposal effects',
        content: 'function compute(){using resource=undefined;return 42;}export const value=compute();',
        result: { value: 42 },
        native: { error: null, value: 42 },
        remainingCalls: 0
    },
    {
        name: 'resource initializer honors shadowed undefined',
        content: 'const undefined=1;function compute(){using resource=undefined;return 42;}' +
            'export const value=compute();',
        result: undefined,
        native: { error: { name: 'TypeError' } },
        remainingCalls: 1
    },
    {
        name: 'resource binding remains readonly',
        content: 'function compute(){using resource=null;resource=null;return 42;}export const value=compute();',
        result: undefined,
        native: { error: { name: 'TypeError' } },
        remainingCalls: 1
    },
    {
        name: 'resource initialization precedes break',
        content: 'function compute(){do{using resource={};break;}while(false);return 42;}' +
            'export const value=compute();',
        result: undefined,
        native: { error: { name: 'TypeError' } },
        remainingCalls: 1
    },
    {
        name: 'nullish resources allow continue evaluation',
        content: 'function compute(){let count=0;do{using resource=null;count++;continue;}while(count<2);' +
            'return count;}export const value=compute();',
        result: { value: 2 },
        native: { error: null, value: 2 },
        remainingCalls: 0
    },
    {
        name: 'disposal runs before returning to the caller',
        content: 'let disposed=0;function compute(){using resource={[Symbol.dispose](){disposed++;}};return 42;}' +
            'export const value=compute()+disposed;',
        result: undefined,
        native: { error: null, value: 43 },
        remainingCalls: 1
    },
    {
        name: 'continue disposes each iteration resource',
        content: 'let disposed=0;function compute(){for(let index=0;index<2;index++){' +
            'using resource={[Symbol.dispose](){disposed++;}};continue;}return 42;}' +
            'export const value=compute()+disposed;',
        result: undefined,
        native: { error: null, value: 44 },
        remainingCalls: 1
    }
];

suite('resource binding evaluation', function () {
    test('removes an unused nullish module resource', async function () {
        const fixture = singleFileOracleCase('using resource=null;export function probe(){return 42;}', 'index.js');
        const [ output ] = await eliminateDeadCodeAndAssertAllOutputValid(fixture);
        const content = output?.contents[0]?.fileDescription.content;
        assertDefined(content);
        assert.strictEqual(createProject().createSourceFile('output.js', content).getVariableStatements().length, 0);
    });

    for (const input of cases) {
        test(input.name, async function () {
            await assertSingleFileEvaluation(input);
        });
    }
});
