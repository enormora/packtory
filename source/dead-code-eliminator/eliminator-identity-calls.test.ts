import { suite, test } from 'mocha';
import { assertSingleFileCallReduction } from '../test-libraries/dead-code-elimination-single-file-case.ts';

const cases = [
    {
        name: 'unknown object result',
        content: 'function identity(value){return value;}export function probe(){return identity({answer:42}).answer;}',
        calls: 0
    },
    {
        name: 'unknown public parameter',
        content:
            'function identity(value){return value;}export function probe(value={answer:42}){return identity(value).answer;}',
        calls: 0
    },
    {
        name: 'receiver value',
        content:
            'function identity(value){return value;}const object={method(){return this===undefined;}};export function probe(){return identity(object.method)();}',
        calls: 0
    },
    {
        name: 'anonymous function name',
        content:
            'function identity(value){return value;}const result=identity(function(){});export function probe(){return result.name;}',
        calls: 0
    },
    {
        name: 'anonymous class name',
        content:
            'function identity(value){return value;}const result=identity(class {static captured=this.name;});export function probe(){return [result.name,result.captured];}',
        calls: 0
    },
    {
        name: 'delete reads argument',
        content:
            'function identity(value){return value;}const object={get answer(){console.log("read");return 42;}};export function probe(){return [delete identity(object.answer),Object.hasOwn(object,"answer")];}',
        calls: 0
    },
    {
        name: 'typeof unbound argument',
        content: 'function identity(value){return value;}export function probe(){return typeof identity(missing);}',
        calls: 0
    },
    {
        name: 'argument exception',
        content:
            'function identity(value){return value;}export function probe(){return identity((()=>{throw new Error("argument");})());}',
        calls: 0
    },
    {
        name: 'argument effect',
        content:
            'function identity(value){return value;}export function probe(){return identity((console.log("argument"),{answer:42})).answer;}',
        calls: 0
    },
    {
        name: 'nested identity calls',
        content:
            'function identity(value){return value;}export function probe(){return identity(identity({answer:42})).answer;}',
        calls: 0
    },
    {
        name: 'indirect eval',
        content:
            'function identity(value){return value;}const hidden=42;export function probe(){return identity(eval)("typeof hidden");}',
        calls: 0
    },
    {
        name: 'additional argument effect',
        content:
            'function identity(value){return value;}export function probe(){return identity({answer:42},console.log("extra")).answer;}',
        calls: 1
    },
    {
        name: 'rest parameter result',
        content:
            'function identity(...value){return value;}export function probe(){return identity({answer:42})[0].answer;}',
        calls: 1
    },
    {
        name: 'parameter default',
        content:
            'function identity(value=console.log("default")){return value;}export function probe(){return identity(undefined);}',
        calls: 1
    },
    {
        name: 'spread argument',
        content:
            'function identity(value){return value;}export function probe(){return identity(...[{answer:42}]).answer;}',
        calls: 1
    },
    {
        name: 'hoisted replacement parameter',
        content:
            'function identity(value){return value;function value(){return 7;}}export function probe(){return identity({answer:42})();}',
        calls: 1
    },
    {
        name: 'primitive parameter replaced by hoisting',
        content:
            'function identity(value){return typeof value;function value(){return 7;}}export function probe(){return identity(42);}',
        calls: 1
    },
    {
        name: 'reassigned function',
        content:
            'function identity(value){return value;}identity=()=>({answer:7});export function probe(){return identity({answer:42}).answer;}',
        calls: 1
    },
    {
        name: 'assignment target error',
        content:
            'function identity(value){return value;}export function probe(){identity(console.log("argument"))=42;}',
        calls: 1
    },
    {
        name: 'postfix update target error',
        content: 'function identity(value){return value;}export function probe(){identity(console.log("argument"))++;}',
        calls: 1
    },
    {
        name: 'prefix update target error',
        content: 'function identity(value){return value;}export function probe(){++identity(console.log("argument"));}',
        calls: 1
    },
    {
        name: 'primitive compound target error',
        content: 'function identity(value){return value;}export function probe(){identity(42)+=1;}',
        calls: 1
    },
    {
        name: 'parenthesized target error',
        content:
            'function identity(value){return value;}export function probe(){((identity(console.log("argument"))))=42;}',
        calls: 1
    },
    {
        name: 'for-in target error',
        content:
            'function identity(value){return value;}export function probe(){for(identity(console.log("argument")) in {x:1}){}}',
        calls: 1
    },
    {
        name: 'property assignment receiver',
        content:
            'function identity(value){return value;}export function probe(){const object={answer:1};identity(object).answer=42;return object.answer;}',
        calls: 0
    },
    {
        name: 'computed assignment key',
        content:
            'function identity(value){return value;}export function probe(){const object={};object[identity({key:"answer"}).key]=42;return object.answer;}',
        calls: 0
    },
    {
        name: 'nonidentity creation',
        content:
            'function identity(value){return {value};}export function probe(){return identity({answer:42}).value.answer;}',
        calls: 0
    }
];

suite('identity call specialization', function () {
    for (const { name, content, calls } of cases) {
        test(`preserves ${name}`, async function () {
            await assertSingleFileCallReduction({
                content,
                targetFilePath: 'index.js',
                callee: 'identity',
                remainingCalls: calls
            });
        });
    }
});
