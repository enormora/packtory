import { suite, test } from 'mocha';
import { assertSingleFileCallReduction } from '../test-libraries/dead-code-elimination-single-file-case.ts';

const cases = [
    {
        name: 'empty record state loop',
        content:
            'function compute(n){const state={sum:0};for(let i=0;i<n;i++)state.sum+=i;return state.sum;}export function probe(){return compute(0);}',
        calls: 0
    },
    {
        name: 'record state loop',
        content:
            'function compute(n){const state={sum:0};for(let i=0;i<n;i++)state.sum+=i;return state.sum;}export function probe(){return compute(10);}',
        calls: 0
    },
    {
        name: 'nested record state',
        content:
            'function compute(){const state={counter:{n:0},sum:0};for(let i=0;i<5;i++)state.sum+=state.counter.n++;return state.sum;}export function probe(){return compute();}',
        calls: 0
    },
    {
        name: 'shared alias',
        content:
            'function compute(){const state={n:1};const alias=state;alias.n++;return state.n;}export function probe(){return compute();}',
        calls: 0
    },
    {
        name: 'record passed to another function',
        content:
            'function increment(state){state.n++;return state.n;}function compute(){const state={n:1};const result=increment(state);return state.n*100+result;}export function probe(){return compute();}',
        calls: 0
    },
    {
        name: 'compound value before right side mutation',
        content:
            'function compute(){let reads=0;const state={n:1};state[(reads++,"n")]+=((state.n=5),2);return state.n*10+reads;}export function probe(){return compute();}',
        calls: 0
    },
    {
        name: 'assignment receiver before right side rebinding',
        content:
            'function compute(){let state={n:1};const original=state;state.n=(state={n:9},2);return original.n*100+state.n;}export function probe(){return compute();}',
        calls: 0
    },
    {
        name: 'compound receiver before right side rebinding',
        content:
            'function compute(){let state={n:1};const original=state;state.n+=(state={n:9},2);return original.n*100+state.n;}export function probe(){return compute();}',
        calls: 0
    },
    {
        name: 'computed update receiver evaluated once',
        content:
            'function compute(){let reads=0;const state={nested:{n:1}};const before=state[(reads++,"nested")].n++;return before*100+reads;}export function probe(){return compute();}',
        calls: 0
    },
    {
        name: 'postfix negative zero',
        content: 'function compute(){const state={n:-0};return state.n++;}export function probe(){return compute();}',
        calls: 0
    },
    {
        name: 'string accumulation',
        content:
            'function compute(){const state={text:"a"};state.text+="b";return state.text;}export function probe(){return compute();}',
        calls: 0
    },
    {
        name: 'addition assignment',
        content: 'function compute(){const state={n:12};return state.n+=3;}export function probe(){return compute();}',
        calls: 0
    },
    {
        name: 'subtraction assignment',
        content: 'function compute(){const state={n:12};return state.n-=3;}export function probe(){return compute();}',
        calls: 0
    },
    {
        name: 'multiplication assignment',
        content: 'function compute(){const state={n:12};return state.n*=3;}export function probe(){return compute();}',
        calls: 0
    },
    {
        name: 'division assignment',
        content: 'function compute(){const state={n:12};return state.n/=3;}export function probe(){return compute();}',
        calls: 0
    },
    {
        name: 'remainder assignment',
        content: 'function compute(){const state={n:12};return state.n%=3;}export function probe(){return compute();}',
        calls: 0
    },
    {
        name: 'active OR assignment',
        content:
            'function compute(){const state={n:0};state.n||=42;return state.n;}export function probe(){return compute();}',
        calls: 0
    },
    {
        name: 'bypassed OR assignment',
        content:
            'function compute(){const state={n:3};return state.n||=missing();}export function probe(){return compute();}',
        calls: 0
    },
    {
        name: 'active AND assignment',
        content:
            'function compute(){const state={n:3};state.n&&=42;return state.n;}export function probe(){return compute();}',
        calls: 0
    },
    {
        name: 'bypassed AND assignment',
        content:
            'function compute(){const state={n:0};return state.n&&=missing();}export function probe(){return compute();}',
        calls: 0
    },
    {
        name: 'active nullish assignment',
        content:
            'function compute(){const state={n:null};state.n??=42;return state.n;}export function probe(){return compute();}',
        calls: 0
    },
    {
        name: 'bypassed nullish assignment',
        content:
            'function compute(){const state={n:0};return state.n??=missing();}export function probe(){return compute();}',
        calls: 0
    },
    {
        name: 'bypassed const binding assignment',
        content:
            'function compute(){const value=3;return value||=missing();}export function probe(){return compute();}',
        calls: 0
    },
    {
        name: 'null prototype added field',
        content:
            'function compute(){const state={__proto__:null};state.n=42;return state.n;}export function probe(){return compute();}',
        calls: 0
    },
    {
        name: 'null prototype added prototype field',
        content:
            'function compute(){const state={__proto__:null};state.__proto__={n:42};return state.__proto__.n;}export function probe(){return compute();}',
        calls: 0
    },
    {
        name: 'cyclic record identity',
        content:
            'function compute(){const state={self:null};state.self=state;return state.self===state;}export function probe(){return compute();}',
        calls: 0
    },
    {
        name: 'write through a cyclic alias',
        content:
            'function compute(){const state={self:null,n:1};state.self=state;state.self.n++;return state.n;}export function probe(){return compute();}',
        calls: 0
    },
    {
        name: 'own field bypasses inherited setter',
        content:
            'Object.defineProperty(Object.prototype,"n",{set(value){console.log("setter",value);}});function compute(){const state={n:1};state.n=42;return state.n;}export function probe(){return compute();}',
        calls: 0
    },
    {
        name: 'const binding failure',
        content:
            'function compute(){const state={n:1};state={n:42};return state.n;}export function probe(){return compute();}',
        calls: 1
    },
    {
        name: 'active const logical assignment failure',
        content: 'function compute(){const value=0;return value||=42;}export function probe(){return compute();}',
        calls: 1
    },
    {
        name: 'inherited setter',
        content:
            'Object.defineProperty(Object.prototype,"n",{set(value){console.log("setter",value);}});function compute(){const state={};state.n=42;return 7;}export function probe(){return compute();}',
        calls: 1
    },
    {
        name: 'ordinary prototype replacement',
        content:
            'function compute(){const state={};state.__proto__={n:42};return state.n;}export function probe(){return compute();}',
        calls: 1
    },
    {
        name: 'accessor assignment',
        content:
            'function compute(){const state={set n(value){console.log("setter",value);}};state.n=42;return 7;}export function probe(){return compute();}',
        calls: 1
    },
    {
        name: 'Proxy assignment',
        content:
            'function compute(){const state=new Proxy({n:1},{set(target,key,value){console.log("set",key,value);return Reflect.set(target,key,value);}});state.n=42;return state.n;}export function probe(){return compute();}',
        calls: 1
    },
    {
        name: 'frozen record failure',
        content:
            'function compute(){const state={n:1};Object.freeze(state);state.n=42;return state.n;}export function probe(){return compute();}',
        calls: 1
    },
    {
        name: 'escaped mutable record',
        content:
            'function publish(state){globalThis.saved=state;console.log("escape");}function compute(){const state={n:1};publish(state);state.n=42;return state.n;}export function probe(){return compute();}',
        calls: 1
    },
    {
        name: 'record coercion in compound assignment',
        content:
            'Object.defineProperty(Object.prototype,"valueOf",{value(){console.log("coerce");return 41;}});function compute(){const state={n:{}};return state.n+=1;}export function probe(){return compute();}',
        calls: 1
    },
    {
        name: 'evaluation budget fallback',
        content:
            'function compute(){const state={n:0};for(let i=0;i<4000;i++)state.n++;return state.n;}export function probe(){return compute();}',
        calls: 1
    }
];

suite('bounded record writes', function () {
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
