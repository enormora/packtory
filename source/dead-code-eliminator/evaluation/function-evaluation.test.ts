import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createFunctionEvaluation } from './function-evaluation.ts';

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
            assert.deepStrictEqual(
                createFunctionEvaluation(source).bodyValue(source.getFunctionOrThrow('compute')),
                expected
            );
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
                createFunctionEvaluation(source).callValue(source.getFunctionOrThrow('compute'), [], function () {
                    assert.fail('An unsupported function cannot read captured constants');
                }),
                undefined
            );
        });
    }

    test('gives each body a fresh budget within one source evaluation', function () {
        const source = createProject().createSourceFile(
            'index.js',
            'function expensive(){while(true){}}function answer(){let value=21;value*=2;return value;}'
        );
        const evaluate = createFunctionEvaluation(source);
        assert.strictEqual(evaluate.bodyValue(source.getFunctionOrThrow('expensive')), undefined);
        assert.deepStrictEqual(evaluate.bodyValue(source.getFunctionOrThrow('answer')), { value: 42 });
    });

    test('reads captured constants separately for each call', function () {
        const source = createProject().createSourceFile('index.js', 'function compute(value){return value*factor;}');
        const evaluate = createFunctionEvaluation(source);
        const target = source.getFunctionOrThrow('compute');
        assert.deepStrictEqual(
            evaluate.callValue(target, [ { value: 21 } ], function () {
                return { value: 2 };
            }),
            { value: 42 }
        );
        assert.deepStrictEqual(
            evaluate.callValue(target, [ { value: 21 } ], function () {
                return { value: 3 };
            }),
            { value: 63 }
        );
    });
});
