import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createEvaluationBudget, declarationOf } from './evaluation-context.ts';

suite('evaluation context', function () {
    test('allows the configured number of steps and remains exhausted afterwards', function () {
        const consume = createEvaluationBudget(2);
        assert.deepStrictEqual([ consume(), consume(), consume(), consume() ], [ true, true, false, false ]);
    });

    test('rejects the first step when no steps are available', function () {
        assert.strictEqual(createEvaluationBudget(0)(), false);
    });

    for (const maximumSteps of [ -1, 0.5, Number.NaN ]) {
        test(`keeps an unavailable budget exhausted for ${maximumSteps}`, function () {
            const consume = createEvaluationBudget(maximumSteps);
            assert.deepStrictEqual([ consume(), consume() ], [ false, false ]);
        });
    }

    test('allows only complete steps from a fractional budget', function () {
        const consume = createEvaluationBudget(2.5);
        assert.deepStrictEqual([ consume(), consume(), consume(), consume() ], [ true, true, false, false ]);
    });

    test('supports large evaluation budgets', function () {
        const consume = createEvaluationBudget(Number.MAX_SAFE_INTEGER);
        assert.deepStrictEqual([ consume(), consume() ], [ true, true ]);
    });

    test('keeps separate evaluations independent', function () {
        const first = createEvaluationBudget(1);
        const second = createEvaluationBudget(1);
        assert.strictEqual(first(), true);
        assert.strictEqual(first(), false);
        assert.strictEqual(second(), true);
    });

    test('rejects an identifier with merged declarations', function () {
        const source = createProject().createSourceFile('input.ts', 'var value=1;var value=2;const read=value;');
        const read = source.getVariableDeclarationOrThrow('read').getInitializerOrThrow();
        assert.strictEqual(declarationOf(read), undefined);
    });
});
