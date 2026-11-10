import { suite, test } from 'mocha';
import { assertSingleFileCallReduction } from '../test-libraries/dead-code-elimination-single-file-case.ts';

const cases = [
    {
        name: 'numeric exponent property',
        content: 'function make(){return {5e-324:42,5:9};}export function probe(){return make()[5e-324];}',
        makeCalls: 0
    },
    {
        name: 'factory field',
        content: 'function make(n){return {answer:n*2};}export function probe(){return make(21).answer;}',
        makeCalls: 0
    },
    {
        name: 'nested factory field',
        content:
            'function make(n){return {nested:{answer:n*2}};}export function probe(){return make(21).nested.answer;}',
        makeCalls: 0
    },
    {
        name: 'argument-selected branch',
        content:
            'function make(n){if(n<0)console.log("unreachable");return {answer:n*2};}export function probe(){return make(21).answer;}',
        makeCalls: 0
    },
    {
        name: 'local record alias',
        content:
            'function make(n){const record={answer:n*2};return record;}export function probe(){return make(21).answer;}',
        makeCalls: 0
    },
    {
        name: 'shorthand parameter',
        content: 'function make(answer){return {answer};}export function probe(){return make(42).answer;}',
        makeCalls: 0
    },
    {
        name: 'escaped shorthand parameter',
        content:
            'function make(answer){return {\\u0061\\u006e\\u0073\\u0077\\u0065\\u0072};}export function probe(){return make(42).answer;}',
        makeCalls: 0
    },
    {
        name: 'escaped property read',
        content:
            'function make(n){return {answer:n*2};}export function probe(){return make(21).\\u0061\\u006e\\u0073\\u0077\\u0065\\u0072;}',
        makeCalls: 0
    },
    {
        name: 'computed primitive field',
        content: 'function make(n){return {[1+1]:n*2};}export function probe(){return make(21)[2];}',
        makeCalls: 0
    },
    {
        name: 'computed field order',
        content: 'function make(){let n=1;return {[(n=2,"answer")]:n}.answer;}export function probe(){return make();}',
        makeCalls: 0
    },
    {
        name: 'receiver before computed key',
        content:
            'function make(){let n=1;return ({answer:n})[(n=2,"answer")]+n;}export function probe(){return make();}',
        makeCalls: 0
    },
    {
        name: 'duplicate own fields',
        content: 'function make(n){return {answer:0,answer:n*2};}export function probe(){return make(21).answer;}',
        makeCalls: 0
    },
    {
        name: 'null prototype missing field',
        content: 'function make(){return {__proto__:null};}export function probe(){return make().missing;}',
        makeCalls: 0
    },
    {
        name: 'computed prototype field',
        content: 'function make(n){return {["__proto__"]:n*2};}export function probe(){return make(21).__proto__;}',
        makeCalls: 0
    },
    {
        name: 'shorthand prototype field',
        content: 'function make(__proto__){return {__proto__};}export function probe(){return make(42).__proto__;}',
        makeCalls: 0
    },
    {
        name: 'own constructor field',
        content: 'function make(n){return {constructor:n*2};}export function probe(){return make(21).constructor;}',
        makeCalls: 0
    },
    {
        name: 'record passed to a function',
        content: 'function make(record){return record.answer*2;}export function probe(){return make({answer:21});}',
        makeCalls: 0
    },
    {
        name: 'record truthiness',
        content:
            'function make(record){if(record)return record.answer;return 0;}export function probe(){return make({answer:42});}',
        makeCalls: 0
    },
    {
        name: 'record nullish branch',
        content:
            'function make(record){return (record??{answer:0}).answer;}export function probe(){return make({answer:42});}',
        makeCalls: 0
    },
    {
        name: 'record typeof',
        content: 'function make(){return typeof {answer:42};}export function probe(){return make();}',
        makeCalls: 0
    },
    {
        name: 'record void',
        content: 'function make(){return void {answer:42};}export function probe(){return make();}',
        makeCalls: 0
    },
    {
        name: 'same allocation identity',
        content:
            'function make(){const record={answer:42};return record===record;}export function probe(){return make();}',
        makeCalls: 0
    },
    {
        name: 'distinct allocation identity',
        content:
            'function record(){return {answer:42};}function make(){return record()===record();}export function probe(){return make();}',
        makeCalls: 0
    },
    {
        name: 'record and primitive identity',
        content: 'function make(){return {}===0;}export function probe(){return make();}',
        makeCalls: 0
    },
    {
        name: 'record field mutation',
        content:
            'function make(n){const record={answer:n*2};record.answer++;return record;}export function probe(){return make(21).answer;}',
        makeCalls: 0
    },
    {
        name: 'record getter effect',
        content:
            'function make(n){return {get answer(){console.log("get");return n*2;}};}export function probe(){return make(21).answer;}',
        makeCalls: 1
    },
    {
        name: 'record creation effect',
        content:
            'function make(n){return {answer:n*2,other:console.log("creation")};}export function probe(){return make(21).answer;}',
        makeCalls: 1
    },
    {
        name: 'record coercion effect',
        content:
            'function make(){return {valueOf(){console.log("coerce");return 41;}}+1;}export function probe(){return make();}',
        makeCalls: 1
    },
    {
        name: 'ordinary inherited getter',
        content:
            'Object.defineProperty(Object.prototype,"answer",{get(){console.log("inherited");return 42;}});function make(){return {};}export function probe(){return make().answer;}',
        makeCalls: 1
    },
    {
        name: 'custom prototype',
        content:
            'function make(){return {__proto__:{get answer(){console.log("inherited");return 42;}}};}export function probe(){return make().answer;}',
        makeCalls: 1
    },
    {
        name: 'spread construction',
        content: 'function make(record){return {...record};}export function probe(){return make({answer:42}).answer;}',
        makeCalls: 1
    },
    {
        name: 'exported record identity',
        content:
            'function make(n){return {answer:n*2};}export const record=make(21);export function probe(){return record.answer;}',
        makeCalls: 1
    },
    {
        name: 'record alias mutation',
        content:
            'function make(n){return {answer:n*2};}const record=make(21);const alias=record;alias.answer++;export function probe(){return record.answer;}',
        makeCalls: 1
    },
    {
        name: 'property write receiver',
        content:
            'function make(){return {answer:1};}const record=make();record.answer=42;export function probe(){return record.answer;}',
        makeCalls: 1
    },
    {
        name: 'fresh property assignment target',
        content: 'function make(){return ({answer:1}).answer=42;}export function probe(){return make();}',
        makeCalls: 0
    },
    {
        name: 'fresh property postfix update',
        content: 'function make(){return ({answer:1}).answer++;}export function probe(){return make();}',
        makeCalls: 0
    },
    {
        name: 'fresh property prefix update',
        content: 'function make(){return ++({answer:1}).answer;}export function probe(){return make();}',
        makeCalls: 0
    },
    {
        name: 'fresh compound assignment target',
        content: 'function make(){return ({answer:1}).answer+=41;}export function probe(){return make();}',
        makeCalls: 0
    },
    {
        name: 'null prototype missing write target',
        content: 'function make(){return ({__proto__:null}).answer=42;}export function probe(){return make();}',
        makeCalls: 0
    },
    {
        name: 'fresh for-in write target',
        content:
            'function make(){let count=0;for(({answer:1}).answer in {x:1})count++;return count;}export function probe(){return make();}',
        makeCalls: 1
    },
    {
        name: 'fresh property deletion',
        content: 'function make(){return delete ({answer:1}).answer;}export function probe(){return make();}',
        makeCalls: 1
    },
    {
        name: 'computed key coercion',
        content:
            'function make(){return {answer:42};}const key={toString(){console.log("key");return "answer";}};export function probe(){return make()[key];}',
        makeCalls: 1
    },
    {
        name: 'class creation effect in another field',
        content:
            'function make(){return {answer:42,other:class{static{console.log(this.name);}}};}export function probe(){return make().answer;}',
        makeCalls: 1
    },
    {
        name: 'record negation',
        content: 'function make(){return !{answer:42};}export function probe(){return make();}',
        makeCalls: 0
    },
    {
        name: 'null prototype excludes inherited getter',
        content:
            'Object.defineProperty(Object.prototype,"answer",{get(){console.log("inherited");return 42;}});function make(){return {__proto__:null};}export function probe(){return make().answer;}',
        makeCalls: 0
    },
    {
        name: 'private brand exception',
        content:
            'class Holder{#answer;read(){return ({"#answer":42}).#answer;}}export function probe(){return new Holder().read();}',
        makeCalls: 0
    }
];

suite('bounded record evaluation', function () {
    for (const { name, content, makeCalls } of cases) {
        test(`preserves ${name}`, async function () {
            await assertSingleFileCallReduction({
                content,
                targetFilePath: 'index.js',
                callee: 'make',
                remainingCalls: makeCalls
            });
        });
    }
});
