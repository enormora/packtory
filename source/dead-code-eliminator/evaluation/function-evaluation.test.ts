import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { evaluateLocalFunction, evaluateLocalFunctionCall } from './function-evaluation.ts';

suite('isolated function call evaluation', function () {
    for (
        const [ content, expected ] of [
            [ 'function compute(){return undefined;}', { value: undefined } ],
            [ 'function compute(){return 42;}eval("effect()");', undefined ],
            [ 'function compute(){return 42;}const invalid={__proto__:null,__proto__:null};', undefined ],
            [ 'function compute(){return 42;var {value}=missing;}', undefined ]
        ] as const
    ) {
        test(`proves whole function bodies in ${content}`, function () {
            const source = createProject().createSourceFile('index.js', content);
            assert.deepStrictEqual(evaluateLocalFunction(source.getFunctionOrThrow('compute')), expected);
        });
    }
    for (
        const content of [
            'async function compute(){return 42;}',
            'function compute(){return 42;}const invalid={__proto__:null,__proto__:null};',
            'function compute(){return eval("42");}'
        ]
    ) {
        test(`retains unsupported execution in ${content}`, function () {
            const source = createProject().createSourceFile('index.js', content);
            assert.strictEqual(
                evaluateLocalFunctionCall(source.getFunctionOrThrow('compute'), [], function () {
                    assert.fail('An unsupported function cannot read captured constants');
                }),
                undefined
            );
        });
    }
});
