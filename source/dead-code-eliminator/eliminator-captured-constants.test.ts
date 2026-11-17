import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import {
    assertSingleFileEvaluation,
    type SingleFileEvaluationCase
} from '../test-libraries/dead-code-elimination-single-file-case.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import { createSourceEvaluation } from './evaluation/constant-evaluation.ts';

const cases: readonly SingleFileEvaluationCase[] = [ {
    name: 'initialized module constant',
    content: 'const factor=2;function compute(n){return n*factor;}export const value=compute(21);',
    result: {
        value: 42
    },
    remainingCalls: 0
}, {
    name: 'function declared before its captured constant',
    content: 'function compute(n){return n*factor;}const factor=2;export const value=compute(21);',
    result: {
        value: 42
    },
    remainingCalls: 0
}, {
    name: 'recursive calls sharing a captured constant',
    content:
        'const seed=1;function compute(n){return n<2?seed:compute(n-1)+compute(n-2);}export const value=compute(30);',
    result: {
        value: 1_346_269
    },
    remainingCalls: 0
}, {
    name: 'derived captured constant',
    content: 'const base=1;const factor=base+1;function compute(n){return n*factor;}export const value=compute(21);',
    result: {
        value: 42
    },
    remainingCalls: 0
}, {
    name: 'transitive captured read',
    content:
        'const factor=2;function multiply(n){return n*factor;}function compute(n){return multiply(n);}export const value=compute(21);',
    result: {
        value: 42
    },
    remainingCalls: 0
}, {
    name: 'separate evaluations of the same captured function',
    content:
        'const factor=2;function compute(n){return n*factor;}const first=compute(21);export const value=first+compute(1);',
    result: {
        value: 44
    },
    remainingCalls: 0
}, {
    name: 'false captured constant',
    content: 'const flag=false;function compute(){return flag;}export const value=compute();',
    result: {
        value: false
    },
    remainingCalls: 0
}, {
    name: 'module constant shadows the global undefined value',
    content: 'const undefined=7;function compute(){return undefined;}export const value=compute();',
    result: {
        value: 7
    },
    remainingCalls: 0
}, {
    name: 'parameter shadows a module constant',
    content: 'const factor=2;function compute(factor){return factor*3;}export const value=compute(7);',
    result: {
        value: 21
    },
    remainingCalls: 0
}, {
    name: 'mutable capture',
    content: 'let factor=2;function compute(n){return n*factor;}factor=3;export const value=compute(21);',
    result: undefined,
    remainingCalls: 1
}, {
    name: 'mutable record behind a constant binding',
    content:
        'const settings={factor:2};function compute(n){return n*settings.factor;}settings.factor=3;export const value=compute(21);',
    result: undefined,
    remainingCalls: 1
}, {
    name: 'call before captured initialization',
    content: 'export const value=compute(21);const factor=2;function compute(n){return n*factor;}',
    result: undefined,
    remainingCalls: 1
}, {
    name: 'capture during its own initialization',
    content: 'const factor=compute();function compute(){return factor;}export const value=factor;',
    result: undefined,
    remainingCalls: 1
}, {
    name: 'public function invoked before module initialization',
    content:
        'export function read(){return compute(21);}export const value=(()=>{try{return read();}catch(error){return error.name;}})();' +
        'const factor=2;function compute(n){return n*factor;}',
    result: undefined,
    remainingCalls: 3
}, {
    name: 'recursive activation before a function-local constant initializes',
    content:
        'function outer(n){if(n)return inner();const factor=2;return bridge();function inner(){return factor;}function bridge(){return outer(1);}}export const value=outer(0);',
    result: undefined,
    remainingCalls: 4
}, {
    name: 'assignment to a captured constant',
    content: 'const factor=2;function compute(){factor=3;return factor;}export const value=compute();',
    result: undefined,
    remainingCalls: 1
}, {
    name: 'initializer with observable effects',
    content:
        'const factor=(console.log("initialization"),2);function compute(n){return n*factor;}export const value=compute(21);',
    result: undefined,
    remainingCalls: 2
} ];

suite('captured constant evaluation', function () {
    test('preserves local constant facts within their own activation', function () {
        const source = createProject().createSourceFile(
            'input.ts',
            'function compute(){const factor=2;const value=factor*21;return value;}'
        );
        const expression = source
            .getFunctionOrThrow('compute')
            .getBodyOrThrow()
            .asKindOrThrow(SyntaxKind.Block)
            .getVariableDeclarationOrThrow('value')
            .getInitializerOrThrow();
        assert.deepStrictEqual(createSourceEvaluation(source).primitiveValue(expression), {
            value: 42
        });
    });
    for (const input of cases) {
        test(input.name, async function () {
            await assertSingleFileEvaluation(input);
        });
    }
});
