import type { PrimitiveValue } from '../dead-code-eliminator/evaluation/primitive-value.ts';

export type RecursiveCallCase = {
    readonly name: string;
    readonly declarations: string;
    readonly expression: string;
    readonly value: PrimitiveValue;
    readonly remainingCalls: number;
};

export const recursiveCallCases: readonly RecursiveCallCase[] = [
    {
        name: 'distinguishes nearby floating point arguments',
        declarations: 'function read(value){return value;}' +
            'function compute(){return read(1)===read(1.0000000000000002);}',
        expression: 'compute()',
        value: false,
        remainingCalls: 0
    },
    {
        name: 'distinguishes number identities from BigInt arguments',
        declarations: 'function read(value){return value;}' +
            'function compute(){return read(0)===read(0n);}',
        expression: 'compute()',
        value: false,
        remainingCalls: 0
    },
    {
        name: 'does not cache mixed record and primitive arguments',
        declarations: 'function increment(state,amount){state.value+=amount;return state.value;}' +
            'function compute(){const state={value:0};return increment(state,1)*10+increment(state,1);}',
        expression: 'compute()',
        value: 12,
        remainingCalls: 0
    },
    {
        name: 'overlapping recursion',
        declarations: 'function compute(n){return n<2?n:compute(n-1)+compute(n-2);}',
        expression: 'compute(30)',
        value: 832_040,
        remainingCalls: 0
    },
    {
        name: 'overlapping false results',
        declarations: 'function compute(n){return n>1&&(compute(n-1)||compute(n-2));}',
        expression: 'compute(30)',
        value: false,
        remainingCalls: 0
    },
    {
        name: 'overlapping zero results',
        declarations: 'function compute(n){return n>1?compute(n-1)+compute(n-2):0;}',
        expression: 'compute(30)',
        value: 0,
        remainingCalls: 0
    },
    {
        name: 'overlapping undefined results',
        declarations: 'function compute(n){if(n>1){compute(n-1);compute(n-2);}}',
        expression: 'compute(30)',
        value: undefined,
        remainingCalls: 0
    },
    {
        name: 'overlapping null results',
        declarations: 'function compute(n){if(n>1){compute(n-1);compute(n-2);}return null;}',
        expression: 'compute(30)',
        value: null,
        remainingCalls: 0
    },
    {
        name: 'result reuse across loop iterations',
        declarations: 'function fib(n){return n<2?n:fib(n-1)+fib(n-2);}function compute(){let value=0;' +
            'for(let i=0;i<=30;i++)value=fib(i);return value;}',
        expression: 'compute()',
        value: 832_040,
        remainingCalls: 0
    },
    {
        name: 'argument effects before repeated calls',
        declarations: 'function constant(n){return n;}function compute(){let count=0;' +
            'for(let i=0;i<3;i++){constant((count++,0));}return count;}',
        expression: 'compute()',
        value: 3,
        remainingCalls: 0
    },
    {
        name: 'record argument mutation',
        declarations: 'function increment(state){return ++state.count;}function compute(){const state={count:0};' +
            'return increment(state)*10+increment(state);}',
        expression: 'compute()',
        value: 12,
        remainingCalls: 0
    },
    {
        name: 'fresh result identity',
        declarations: 'function make(n){return {n};}function compute(){return make(1)===make(1);}',
        expression: 'compute()',
        value: false,
        remainingCalls: 0
    },
    {
        name: 'signed zero arguments',
        declarations: 'function reciprocal(n){return 1/n;}',
        expression: 'reciprocal(0)===reciprocal(-0)',
        value: false,
        remainingCalls: 0
    },
    {
        name: 'argument types',
        declarations: 'function kind(n){return typeof n;}',
        expression: 'kind(1)+":"+kind("1")+":"+kind(undefined)+":"+kind("undefined")',
        value: 'number:string:undefined:string',
        remainingCalls: 0
    },
    {
        name: 'argument counts',
        declarations: 'function kind(n){return typeof n;}',
        expression: 'kind()+":"+kind(0)+":"+kind()+":"+kind(undefined)',
        value: 'undefined:number:undefined:undefined',
        remainingCalls: 0
    },
    {
        name: 'multiple arguments',
        declarations: 'function compute(left,right){return left+right;}',
        expression: 'compute(1,2)*10+compute(1,3)',
        value: 34,
        remainingCalls: 0
    },
    {
        name: 'distinct functions',
        declarations: 'function left(n){return n+1;}function right(n){return n+2;}',
        expression: 'left(1)+right(1)',
        value: 5,
        remainingCalls: 0
    },
    {
        name: 'mutable captures remain unknown',
        declarations: 'let total=0;function compute(n){total+=n;return total;}',
        expression: 'compute(1)*10+compute(1)',
        value: 12,
        remainingCalls: 2
    },
    {
        name: 'mutable captures inside an evaluated caller remain unknown',
        declarations: 'function compute(){let total=0;let code=0;for(let i=0;i<2;i++){' +
            'code=code*10+((n)=>{total+=n;return total;})(1);}return code;}',
        expression: 'compute()',
        value: 12,
        remainingCalls: 2
    },
    {
        name: 'depth limit',
        declarations: 'function compute(n){return n>0?compute(n-1):42;}',
        expression: 'compute(40)',
        value: 42,
        remainingCalls: 2
    },
    {
        name: 'step limit',
        declarations: 'function compute(){let result=0;for(let i=0;i<3000;i++)result++;return result;}',
        expression: 'compute()',
        value: 3000,
        remainingCalls: 1
    },
    {
        name: 'unknown extra arguments still throw',
        declarations: 'function compute(n){return n;}',
        expression: '(()=>{try{return compute(1,missing);}catch(error){return error.name;}})()',
        value: 'ReferenceError',
        remainingCalls: 2
    },
    {
        name: 'parameter writes preserve caller values',
        declarations: 'function increment(n){n++;return n;}function compute(){let value=1;' +
            'return increment(value)*10+increment(value)+value;}',
        expression: 'compute()',
        value: 23,
        remainingCalls: 0
    },
    {
        name: 'destructuring parameters still throw',
        declarations: 'function compute({n}){return 1;}',
        expression: '(()=>{try{return compute(null);}catch(error){return error.name;}})()',
        value: 'TypeError',
        remainingCalls: 2
    },
    {
        name: 'rest parameters retain their array identity',
        declarations: 'function compute(...values){return typeof values;}',
        expression: 'compute(1)',
        value: 'object',
        remainingCalls: 1
    },
    {
        name: 'default parameter effects',
        declarations: 'function compute(n=console.log("default")){return 1;}',
        expression: 'compute()',
        value: 1,
        remainingCalls: 2
    },
    {
        name: 'async results retain their promise',
        declarations: 'async function compute(){return 1;}',
        expression: 'typeof compute().then',
        value: 'function',
        remainingCalls: 1
    },
    {
        name: 'generator results retain their iterator',
        declarations: 'function* compute(){return 1;}',
        expression: 'typeof compute().next',
        value: 'function',
        remainingCalls: 1
    },
    {
        name: 'exceptions remain unknown',
        declarations: 'function compute(n){return missing+n;}',
        expression: '(()=>{try{return compute(1);}catch(error){return error.name;}})()',
        value: 'ReferenceError',
        remainingCalls: 2
    }
];
