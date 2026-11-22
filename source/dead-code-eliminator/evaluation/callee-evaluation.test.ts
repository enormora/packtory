import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createBoundedEvaluationContext } from '../../test-libraries/bounded-evaluation-context.ts';
import type { Completion, EvaluationContext } from './evaluation-context.ts';
import { createCallEvaluator } from './callee-evaluation.ts';
import { evaluated } from './primitive-value.ts';

suite('function completion boundaries', function () {
    for (
        const [ content, expectedExecutions ] of [
            [ 'function compute(){return compute();}compute();export{};', 1 ],
            [ 'function compute(){return other();}function other(){return compute();}compute();export{};', 2 ]
        ] as const
    ) {
        test(`rejects recursive call cycles without repeating function bodies in ${content}`, function () {
            const source = createProject().createSourceFile('index.js', content);
            const call = source
                .getFirstDescendantByKindOrThrow(SyntaxKind.ExpressionStatement)
                .getExpression()
                .asKindOrThrow(SyntaxKind.CallExpression);
            const evaluate = createCallEvaluator(source)();
            const base = createBoundedEvaluationContext(0, 1000);
            let executions = 0;
            const context: EvaluationContext = {
                ...base,
                call: evaluate,
                execute(node, active) {
                    if (node.getKind() === SyntaxKind.Block) {
                        executions += 1;
                    }
                    return base.execute(node, active);
                }
            };
            assert.strictEqual(evaluate(call, context), undefined);
            assert.strictEqual(executions, expectedExecutions);
            assert.strictEqual(evaluate(call, context), undefined);
            assert.strictEqual(executions, expectedExecutions * 2);
        });
    }

    test('allows evaluation to retry after the statement executor throws', function () {
        const source = createProject().createSourceFile('index.js', 'function compute(){}compute();export{};');
        const call = source.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
        const evaluate = createCallEvaluator(source)();
        const error = new Error('Statement evaluation failed');
        let executions = 0;
        const context: EvaluationContext = {
            ...createBoundedEvaluationContext(0, 100),
            execute() {
                executions += 1;
                if (executions === 1) {
                    throw error;
                }
                return { type: 'return', value: evaluated(42) };
            }
        };
        assert.throws(function () {
            evaluate(call, context);
        }, error);
        assert.deepStrictEqual(evaluate(call, context), evaluated(42));
        assert.strictEqual(executions, 2);
    });

    for (
        const content of [
            'function* compute(){return 42;}compute();',
            'async function compute(){return 42;}compute();',
            'const compute=async()=>42;compute();',
            'function compute(value){return 42;}compute(missing);',
            'function compute(){return 42;}compute(missing);'
        ]
    ) {
        test(`retains native call behavior for ${content}`, function () {
            const source = createProject().createSourceFile('input.ts', content);
            const call = source.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
            assert.strictEqual(
                createCallEvaluator(source)()(call, createBoundedEvaluationContext(0, 100)),
                undefined
            );
        });
    }

    for (const type of [ 'break', 'continue' ] as const) {
        test(`rejects an unconsumed ${type} from the statement evaluator`, function () {
            const source = createProject().createSourceFile('index.ts', 'function compute(){}compute();export{};');
            const call = source.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
            const context = {
                ...createBoundedEvaluationContext(0, 100),
                execute(): Completion {
                    return { type };
                }
            };
            assert.strictEqual(createCallEvaluator(source)()(call, context), undefined);
        });
    }
});
