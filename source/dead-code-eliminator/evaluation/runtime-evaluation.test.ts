import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createRuntimeSourceEvaluation } from './constant-evaluation.ts';
import { createRuntimeBoundedEvaluator, createRuntimeConstantEvaluator } from './runtime-evaluation.ts';

suite('runtime evaluation', function () {
    for (
        const { name, createEvaluator } of [
            { name: 'allocated and primitive values', createEvaluator: createRuntimeBoundedEvaluator },
            { name: 'primitive values', createEvaluator: createRuntimeConstantEvaluator }
        ]
    ) {
        suite(name, function () {
            test('evaluates calls in valid runtime source', function () {
                const source = createProject().createSourceFile(
                    'input.js',
                    'function compute(){return 42;}const result=compute();export{};'
                );
                const expression = source.getVariableDeclarationOrThrow('result').getInitializerOrThrow();
                assert.deepStrictEqual(createEvaluator(source, new Map())(expression), { value: 42 });
            });

            test('rejects an early error elsewhere in the source', function () {
                const source = createProject().createSourceFile(
                    'input.js',
                    'function compute(){return 42;}const invalid={__proto__:null,__proto__:null};const result=compute();export{};'
                );
                const expression = source.getVariableDeclarationOrThrow('result').getInitializerOrThrow();
                assert.strictEqual(createEvaluator(source, new Map())(expression), undefined);
            });
        });
    }

    suite('source values', function () {
        for (
            const [ name, content ] of [
                [
                    'retains malformed argument syntax',
                    'function compute(input){return input;}export const value=compute(,);'
                ],
                [ 'retains resource initialization syntax errors', 'using resource;export const value=42;' ],
                [ 'retains malformed calls', 'function compute(value){return value;}const value=compute(,);' ]
            ] as const
        ) {
            test(name, function () {
                const source = createProject().createSourceFile('input.ts', content);
                const expression = source.getVariableDeclarationOrThrow('value').getInitializerOrThrow();
                assert.strictEqual(createRuntimeSourceEvaluation(source).primitiveValue(expression), undefined);
                assert.strictEqual(source.getFullText(), content);
            });
        }

        test('retains known values and discardability in valid source', function () {
            const source = createProject().createSourceFile('input.js', 'const base=21;const value=base*2;export{};');
            const expression = source.getVariableDeclarationOrThrow('value').getInitializerOrThrow();
            const evaluation = createRuntimeSourceEvaluation(source);
            assert.deepStrictEqual(evaluation.knownValue(expression), { value: 42 });
            assert.deepStrictEqual(evaluation.primitiveValue(expression), { value: 42 });
            assert.strictEqual(evaluation.canDiscard(expression), true);
        });

        test('rejects calls in invalid source through every evaluation operation', function () {
            const source = createProject().createSourceFile(
                'input.js',
                'function compute(){return 42;}const invalid={__proto__:null,__proto__:null};const value=compute();export{};'
            );
            const expression = source.getVariableDeclarationOrThrow('value').getInitializerOrThrow();
            const evaluation = createRuntimeSourceEvaluation(source);
            assert.strictEqual(evaluation.knownValue(expression), undefined);
            assert.strictEqual(evaluation.primitiveValue(expression), undefined);
            assert.strictEqual(evaluation.canDiscard(expression), false);
        });

        test('keeps local read safety separate from invalid module evaluation', function () {
            const source = createProject().createSourceFile(
                'input.js',
                'const stable=1;const value=stable;const invalid={__proto__:null,__proto__:null};export{};'
            );
            const expression = source.getVariableDeclarationOrThrow('value').getInitializerOrThrow();
            const evaluation = createRuntimeSourceEvaluation(source);
            assert.strictEqual(evaluation.primitiveValue(expression), undefined);
            assert.strictEqual(evaluation.canDiscard(expression), true);
        });
    });
});
