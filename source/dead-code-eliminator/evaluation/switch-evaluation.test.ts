import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createBoundedEvaluationContext } from '../../test-libraries/bounded-evaluation-context.ts';
import { evaluateSwitch } from './switch-evaluation.ts';

suite('switch evaluation budgets', function () {
    for (const budget of [ 0, 1 ]) {
        test(`stops at the first exhausted step with budget ${budget}`, function () {
            const source = createProject().createSourceFile('input.ts', 'switch(1){case 1:;}');
            let consumed = 0;
            const context = {
                ...createBoundedEvaluationContext(0, 100),
                consume() {
                    consumed += 1;
                    assert.ok(consumed <= budget + 1);
                    return consumed <= budget;
                },
                evaluate() {
                    return { value: 1 };
                },
                execute() {
                    assert.fail('exhausted switches must not execute statements');
                }
            };
            assert.strictEqual(
                evaluateSwitch(source.getFirstDescendantByKindOrThrow(SyntaxKind.SwitchStatement), context),
                undefined
            );
            assert.strictEqual(consumed, budget + 1);
        });
    }
});
