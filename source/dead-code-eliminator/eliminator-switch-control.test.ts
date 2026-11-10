import { suite, test } from 'mocha';
import {
    assertSingleFileEvaluation,
    type SingleFileEvaluationCase
} from '../test-libraries/dead-code-elimination-single-file-case.ts';

const cases: readonly SingleFileEvaluationCase[] = [
    {
        name: 'selects a matching case',
        content: 'function compute(n){switch(n){case 1:return "one";case 2:return "two";default:return "other";}}' +
            'export const value=compute(2);',
        result: { value: 'two' },
        native: { error: null, value: 'two' },
        remainingCalls: 0
    },
    {
        name: 'selects the default without a match',
        content: 'function compute(){switch(3){case 1:return 1;default:return 9;}}export const value=compute();',
        result: { value: 9 },
        native: { error: null, value: 9 },
        remainingCalls: 0
    },
    {
        name: 'continues after no matching case',
        content: 'function compute(){switch(3){case 1:return 1;}return 5;}export const value=compute();',
        result: { value: 5 },
        native: { error: null, value: 5 },
        remainingCalls: 0
    },
    {
        name: 'continues after an empty switch',
        content: 'function compute(){switch(3){}return 5;}export const value=compute();',
        result: { value: 5 },
        native: { error: null, value: 5 },
        remainingCalls: 0
    },
    {
        name: 'falls through to the next case',
        content: 'function compute(){let total=0;switch(1){case 1:total++;case 2:total+=2;break;default:total=9;}' +
            'return total;}export const value=compute();',
        result: { value: 3 },
        native: { error: null, value: 3 },
        remainingCalls: 0
    },
    {
        name: 'prefers a matching case after the default',
        content: 'function compute(){switch(2){default:return 9;case 2:return 2;}}export const value=compute();',
        result: { value: 2 },
        native: { error: null, value: 2 },
        remainingCalls: 0
    },
    {
        name: 'falls through a default between cases',
        content: 'function compute(){let total=0;switch(1){case 1:total++;default:total+=10;case 2:total+=100;}' +
            'return total;}export const value=compute();',
        result: { value: 111 },
        native: { error: null, value: 111 },
        remainingCalls: 0
    },
    {
        name: 'falls through from the default',
        content: 'function compute(){let total=0;switch(3){case 1:total++;default:total+=10;case 2:total+=100;}' +
            'return total;}export const value=compute();',
        result: { value: 110 },
        native: { error: null, value: 110 },
        remainingCalls: 0
    },
    {
        name: 'evaluates case expressions in order until a match',
        content: 'function compute(state){switch(12){case (state.trace=state.trace*10+1):return 0;' +
            'case (state.trace=state.trace*10+2):return state.trace;case missing:return 0;}}' +
            'export const value=compute({trace:0});',
        result: { value: 12 },
        native: { error: null, value: 12 },
        remainingCalls: 0
    },
    {
        name: 'evaluates the discriminant before case expressions',
        content: 'function compute(state){switch(state.value=2){case (state.value=3):return 0;' +
            'case 2:return state.value;}}export const value=compute({value:0});',
        result: { value: 3 },
        native: { error: null, value: 3 },
        remainingCalls: 0
    },
    {
        name: 'retains an unknown case before a match',
        content: 'function compute(){switch(2){case missing:return 1;case 2:return 2;}}export const value=compute();',
        result: undefined,
        native: { error: { name: 'ReferenceError' } },
        remainingCalls: 1
    },
    {
        name: 'evaluates cases after an unmatched default',
        content: 'function compute(){switch(2){default:return 9;case missing:return 1;case 2:return 2;}}' +
            'export const value=compute();',
        result: undefined,
        native: { error: { name: 'ReferenceError' } },
        remainingCalls: 1
    },
    {
        name: 'skips an unreachable default body',
        content: 'function compute(){switch(2){case 2:return 42;default:return missing;}}export const value=compute();',
        result: { value: 42 },
        native: { error: null, value: 42 },
        remainingCalls: 0
    },
    {
        name: 'NaN does not match itself',
        content: 'function compute(){switch(0/0){case 0/0:return 1;default:return 42;}}export const value=compute();',
        result: { value: 42 },
        native: { error: null, value: 42 },
        remainingCalls: 0
    },
    {
        name: 'signed zeros match',
        content: 'function compute(){switch(-0){case 0:return 42;default:return 1;}}export const value=compute();',
        result: { value: 42 },
        native: { error: null, value: 42 },
        remainingCalls: 0
    },
    {
        name: 'case matching does not coerce strings',
        content: 'function compute(){switch(1){case "1":return 1;default:return 42;}}export const value=compute();',
        result: { value: 42 },
        native: { error: null, value: 42 },
        remainingCalls: 0
    },
    {
        name: 'case matching distinguishes bigints',
        content: 'function compute(){switch(1n){case 1:return 1;default:return 42;}}export const value=compute();',
        result: { value: 42 },
        native: { error: null, value: 42 },
        remainingCalls: 0
    },
    {
        name: 'matches the same record identity',
        content: 'function compute(state){switch(state){case state:return 42;default:return 1;}}' +
            'export const value=compute({});',
        result: { value: 42 },
        native: { error: null, value: 42 },
        remainingCalls: 0
    },
    {
        name: 'preserves a bigint result without rounding',
        content: 'function compute(){switch(1n){case 1n:return 9007199254740993n;default:return 0n;}}' +
            'export const value=compute();',
        result: { value: 9_007_199_254_740_993n },
        native: { error: null, value: { type: 'bigint', value: '9007199254740993' } },
        remainingCalls: 0
    },
    {
        name: 'matches negative bigints',
        content: 'function compute(){switch(-1n){case -1n:return -42n;default:return 0n;}}' +
            'export const value=compute();',
        result: { value: -42n },
        native: { error: null, value: { type: 'bigint', value: '-42' } },
        remainingCalls: 0
    },
    {
        name: 'cached arguments distinguish numbers and bigints',
        content: 'function compute(n){switch(n){case 1n:return 42;default:return 7;}}' +
            'export const value=compute(1n)*10+compute(1);',
        result: { value: 427 },
        native: { error: null, value: 427 },
        remainingCalls: 0
    },
    {
        name: 'preserves bigint division errors',
        content: 'function compute(){switch(1){case 1:return 1n/0n;}}export const value=compute();',
        result: undefined,
        native: { error: { name: 'RangeError' } },
        remainingCalls: 1
    },
    {
        name: 'preserves mixed bigint arithmetic errors',
        content: 'function compute(){switch(1){case 1:return 1n+1;}}export const value=compute();',
        result: undefined,
        native: { error: { name: 'TypeError' } },
        remainingCalls: 1
    },
    {
        name: 'distinguishes different record identities',
        content: 'function compute(){switch({}){case {}:return 1;default:return 42;}}export const value=compute();',
        result: { value: 42 },
        native: { error: null, value: 42 },
        remainingCalls: 0
    },
    {
        name: 'switch declarations preserve an outer binding',
        content: 'function compute(){let result=0;const local=7;switch(1){case 1:const local=2;result=local;break;}' +
            'return result*10+local;}export const value=compute();',
        result: { value: 27 },
        native: { error: null, value: 27 },
        remainingCalls: 0
    },
    {
        name: 'fallthrough shares initialized lexical bindings',
        content: 'function compute(){switch(1){case 1:const n=2;case 2:return n;}}export const value=compute();',
        result: { value: 2 },
        native: { error: null, value: 2 },
        remainingCalls: 0
    },
    {
        name: 'retains an uninitialized binding in a skipped clause',
        content: 'function compute(){switch(2){case 1:const n=2;case 2:return n;}}export const value=compute();',
        result: undefined,
        native: { error: { name: 'ReferenceError' } },
        remainingCalls: 1
    },
    {
        name: 'case expressions respect lexical shadowing',
        content: 'function compute(){const n=1;switch(1){case n:const n=2;return n;}}export const value=compute();',
        result: undefined,
        native: { error: { name: 'ReferenceError' } },
        remainingCalls: 1
    },
    {
        name: 'continue reaches the surrounding loop',
        content: 'function compute(){let total=0;for(let index=0;index<4;index++){' +
            'switch(index){case 1:continue;default:total+=index;}total+=10;}return total;}' +
            'export const value=compute();',
        result: { value: 35 },
        native: { error: null, value: 35 },
        remainingCalls: 0
    },
    {
        name: 'switch break preserves the surrounding loop',
        content: 'function compute(){let total=0;for(let index=0;index<3;index++){' +
            'switch(index){default:break;}total++;}return total;}export const value=compute();',
        result: { value: 3 },
        native: { error: null, value: 3 },
        remainingCalls: 0
    },
    {
        name: 'loop break preserves the surrounding switch',
        content: 'function compute(){switch(1){case 1:let index=0;while(true){index++;break;}return index+42;}}' +
            'export const value=compute();',
        result: { value: 43 },
        native: { error: null, value: 43 },
        remainingCalls: 0
    },
    {
        name: 'resource initialization precedes switch break',
        content: 'function compute(){switch(1){case 1:{using resource={};break;}}return 42;}' +
            'export const value=compute();',
        result: undefined,
        native: { error: { name: 'TypeError' } },
        remainingCalls: 1
    },
    {
        name: 'retains an unknown discriminant',
        content: 'function compute(){switch(missing){case 1:return 42;}}export const value=compute();',
        result: undefined,
        native: { error: { name: 'ReferenceError' } },
        remainingCalls: 1
    },
    {
        name: 'retains observable case effects',
        content: 'let seen=0;function compute(){switch(1){case 1:seen++;break;}return 42;}' +
            'export const value=compute()+seen;',
        result: undefined,
        native: { error: null, value: 43 },
        remainingCalls: 1
    },
    {
        name: 'case selection preserves the evaluation budget',
        content: `function compute(){let count=0;while(count<20){switch(1){${
            'case 0:'.repeat(50)
        }default:count++;}}return 42;}export const value=compute();`,
        result: undefined,
        native: { error: null, value: 42 },
        remainingCalls: 1
    },
    {
        name: 'fallthrough preserves the evaluation budget',
        content: `function compute(){let count=0;while(count<30){switch(1){case 1:${
            'case 0:'.repeat(70)
        }count++;}}return 42;}export const value=compute();`,
        result: undefined,
        native: { error: null, value: 42 },
        remainingCalls: 1
    }
];

suite('bounded switch evaluation', function () {
    for (const input of cases) {
        test(input.name, async function () {
            await assertSingleFileEvaluation(input);
        });
    }
});
