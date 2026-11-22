import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createSourcePreparation } from '../source-transformation/source-preparation.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import { specializeExpressions } from './transform/expression-specialization.ts';
import { createSourceEvaluation } from './evaluation/constant-evaluation.ts';

const reductions = [
    [ 'array length', 'const values=[1,2,3];return values.length;', 3 ],
    [ 'sparse array length', 'const values=[,,];return values.length;', 2 ],
    [ 'array own write', 'const values=[21];values[0]=42;return values[0];', 42 ],
    [ 'array alias update', 'const values=[21];const alias=values;alias[0]*=2;return values[0];', 42 ],
    [ 'computed object binding', 'const key="value";const {[key]:value}={value:21};return value*2;', 42 ],
    [ 'array element', 'const values=[21,42];return values[1];', 42 ],
    [ 'nested array', 'const values=[[21]];return values[0][0]*2;', 42 ],
    [ 'object binding', 'const {value}={value:21};return value*2;', 42 ],
    [ 'renamed object binding', 'const {value:answer}={value:21};return answer*2;', 42 ],
    [ 'nested object binding', 'const {outer:{value}}={outer:{value:21}};return value*2;', 42 ],
    [ 'undefined default', 'const {value=21}={value:undefined};return value*2;', 42 ],
    [ 'null prototype default', 'const {value=21}={__proto__:null};return value*2;', 42 ],
    [ 'bypassed default', 'const {value=missing()}={value:21};return value*2;', 42 ],
    [ 'mutable binding', 'let {value}={value:21};value*=2;return value;', 42 ],
    [ 'binding order', 'const {first,second=first*2}={first:21,second:undefined};return second;', 42 ]
] as const;

const retained = [
    'const {[{toString(){console.log("key");return "value";}}]:value}={value:42};return value;',
    'const values=[console.log("element")];return values.length;',
    'const values=[...{[Symbol.iterator](){console.log("iterate");return [][Symbol.iterator]();}}];return values.length;',
    'const values=[21];values.length=2;return values.length;',
    'Object.defineProperty(Array.prototype,"missing",{get(){console.log("get");return 42;}});const values=[];return values.missing;',
    'Object.defineProperty(Object.prototype,"value",{get(){console.log("get");return 21;}});const {value}={};return value*2;',
    'const {value}={get value(){console.log("get");return 21;}};return value*2;',
    'const {value=console.log("default")}={value:undefined};return value;',
    'const {value}={value:null};return value.answer;',
    'const {first=second,second=21}={__proto__:null};return first;',
    'const {...rest}={value:42};return rest.value;',
    'const [value]=[42];return value;'
];

suite('aggregate evaluation reductions', function () {
    for (const [ name, body, value ] of reductions) {
        test(`folds ${name}`, function () {
            const content =
                `function compute(){${body}}export const value=compute();export function probe(){return value;}`;
            const source = createProject().createSourceFile('input.js', content);
            assert.deepStrictEqual(
                createSourceEvaluation(source).primitiveValue(
                    source.getVariableDeclarationOrThrow('value').getInitializerOrThrow()
                ),
                { value }
            );
            specializeExpressions(createSourcePreparation(source));
            assert.strictEqual(
                source.getVariableDeclarationOrThrow('value').getInitializerOrThrow().getText(),
                `(${value})`
            );
        });
    }
    for (const body of retained) {
        test(`preserves effects and uncertainty in ${body}`, function () {
            const content = `function compute(){${body}}export function probe(){return compute();}`;
            const source = createProject().createSourceFile('input.js', `${content}const value=compute();`);
            const call = source.getVariableDeclarationOrThrow('value').getInitializerOrThrow();
            assert.strictEqual(createSourceEvaluation(source).primitiveValue(call), undefined);
        });
    }
});
