import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createSourceEvaluation } from './constant-evaluation.ts';
import { createModuleBindingEvaluator } from './module-binding-evaluation.ts';

suite('module binding evaluation', function () {
    for (const initialized of [ true, false ]) {
        test(`caches initialization proof ${initialized} across repeated binding reads`, function () {
            const source = createProject().createSourceFile('/index.js', 'export const value=42;');
            const declaration = source.getVariableDeclarationOrThrow('value');
            let proofs = 0;
            let evaluations = 0;
            const evaluate = createModuleBindingEvaluator({
                initializesBinding(binding) {
                    assert.strictEqual(binding, declaration);
                    proofs += 1;
                    assert.strictEqual(proofs, 1);
                    return initialized;
                },
                evaluateSource(file) {
                    assert.strictEqual(file, source);
                    evaluations += 1;
                    return createSourceEvaluation(file);
                }
            });
            assert.deepStrictEqual(evaluate(declaration), initialized ? { value: 42 } : undefined);
            assert.deepStrictEqual(evaluate(declaration), initialized ? { value: 42 } : undefined);
            assert.strictEqual(evaluations, initialized ? 1 : 0);
            assert.strictEqual(proofs, 1);
        });
    }

    test('shares source evaluation across distinct bindings and keeps module caches separate', function () {
        const project = createProject();
        const first = project.createSourceFile('/first.js', 'export const a=1,b=2;');
        const second = project.createSourceFile('/second.js', 'export const c=3;');
        const evaluated = new Set();
        const evaluate = createModuleBindingEvaluator({
            initializesBinding() {
                return true;
            },
            evaluateSource(source) {
                assert.strictEqual(evaluated.has(source), false);
                evaluated.add(source);
                return createSourceEvaluation(source);
            }
        });
        assert.deepStrictEqual(evaluate(first.getVariableDeclarationOrThrow('a')), { value: 1 });
        assert.deepStrictEqual(evaluate(first.getVariableDeclarationOrThrow('b')), { value: 2 });
        assert.deepStrictEqual(evaluate(second.getVariableDeclarationOrThrow('c')), { value: 3 });
        assert.strictEqual(evaluated.size, 2);
    });

    test('rejects unsupported declarations before initialization or evaluation', function () {
        const source = createProject().createSourceFile('/index.js', 'export function value(){}');
        const evaluate = createModuleBindingEvaluator({
            initializesBinding() {
                assert.fail('unsupported declarations cannot provide initialization facts');
            },
            evaluateSource() {
                assert.fail('unsupported declarations cannot provide constant values');
            }
        });
        assert.strictEqual(evaluate(source.getFunctionOrThrow('value')), undefined);
    });
});
