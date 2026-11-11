import { suite, test } from 'mocha';
import { assertSingleFileCallReduction } from '../test-libraries/dead-code-elimination-single-file-case.ts';

const cases = [
    {
        name: 'unused record result with constant argument',
        content:
            'function compute(n){const state={sum:0};for(let i=0;i<n;i++)state.sum+=i;return state;}const limit=10;const unused=compute(limit);export function probe(){return 42;}',
        calls: 0
    },
    {
        name: 'unused cyclic record result',
        content:
            'function compute(){const state={self:null,n:1};state.self=state;state.self.n++;return state;}const unused=compute();export function probe(){return 42;}',
        calls: 0
    },
    {
        name: 'unused getter result after a loop',
        content:
            'function compute(n){const state={sum:0};for(let i=0;i<n;i++)state.sum+=i;return {get value(){console.log("never");return state.sum;}};}const unused=compute(10);export function probe(){return 42;}',
        calls: 0
    },
    {
        name: 'unused method result after a loop',
        content:
            'function compute(n){const state={sum:0};for(let i=0;i<n;i++)state.sum+=i;return {method(){console.log("never");return state.sum;}};}const unused=compute(10);export function probe(){return 42;}',
        calls: 0
    },
    {
        name: 'unused function-valued field',
        content:
            'function compute(n){const state={value:n};state.value++;return {method:()=>{console.log("never");return state.value;}};}const unused=compute(1);export function probe(){return 42;}',
        calls: 0
    },
    {
        name: 'data field beside an unused method',
        content:
            'function compute(n){return {value:n,method(){console.log("never");}};}export function probe(){return compute(42).value;}',
        calls: 0
    },
    {
        name: 'data field beside an unused getter',
        content:
            'function compute(n){return {value:n,get other(){console.log("never");}};}export function probe(){return compute(42).value;}',
        calls: 0
    },
    {
        name: 'data overrides a getter',
        content:
            'function compute(){return {get n(){console.log("never");return 0;},n:42};}export function probe(){return compute().n;}',
        calls: 0
    },
    {
        name: 'data overrides a function-valued field',
        content:
            'function compute(){return {n:()=>console.log("never"),n:42};}export function probe(){return compute().n;}',
        calls: 0
    },
    {
        name: 'computed method key order',
        content:
            'function compute(){let n=1;return {[(n+=1,"method")](){console.log("never");},value:n};}export function probe(){return compute().value;}',
        calls: 0
    },
    {
        name: 'null prototype own getter',
        content:
            'function compute(){return {__proto__:null,get n(){console.log("get");return 42;}};}export function probe(){return compute().n;}',
        calls: 1
    },
    {
        name: 'null prototype accessor assignment',
        content:
            'function compute(){const state={__proto__:null,set n(value){console.log("set",value);}};state.n=42;return 7;}export function probe(){return compute();}',
        calls: 1
    },
    {
        name: 'getter overrides data',
        content:
            'function compute(){return {n:0,get n(){console.log("get");return 42;}};}export function probe(){return compute().n;}',
        calls: 1
    },
    {
        name: 'method overrides data',
        content: 'function compute(){return {n:0,n(){return 42;}};}export function probe(){return typeof compute().n;}',
        calls: 1
    },
    {
        name: 'function-valued prototype setter',
        content:
            'function compute(){return {__proto__:function(){},n:42};}export function probe(){return compute().n;}',
        calls: 1
    },
    {
        name: 'computed method key coercion',
        content:
            'function compute(){const key={toString(){console.log("key");return "method";}};return {[key](){},value:42};}export function probe(){return compute().value;}',
        calls: 1
    },
    {
        name: 'opaque prototype property on a null prototype',
        content:
            'function compute(){return {__proto__:null,get __proto__(){console.log("get");return 42;}};}export function probe(){return compute().__proto__;}',
        calls: 1
    }
];

suite('record result discardability', function () {
    for (const { name, content, calls } of cases) {
        test(`preserves ${name}`, async function () {
            await assertSingleFileCallReduction({
                content,
                targetFilePath: 'index.js',
                callee: 'compute',
                remainingCalls: calls
            });
        });
    }
});
