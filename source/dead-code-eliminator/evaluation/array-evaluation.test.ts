import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind, type ArrayLiteralExpression } from 'ts-morph';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { createBoundedEvaluationContext } from '../../test-libraries/bounded-evaluation-context.ts';
import { variableInitializer } from '../pure-expression-test-support.ts';
import { isRecordResult, type AllocatedRecord } from './abstract-value.ts';
import { maximumEvaluationDepth } from './evaluation-context.ts';
import { evaluateArray } from './array-evaluation.ts';

function arrayExpression(content: string): ArrayLiteralExpression {
    return variableInitializer(`const value=${content};`, 'value').asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
}

function evaluatedArray(content: string): AllocatedRecord {
    const result = evaluateArray(arrayExpression(content), createBoundedEvaluationContext(0, 100));
    assertDefined(result);
    if (!isRecordResult(result)) {
        assert.fail('Expected a private array allocation');
    }
    return result.value;
}

suite('array evaluation bounds', function () {
    for (
        const [ content, depth, fuel ] of [
            [ '[]', maximumEvaluationDepth, 100 ],
            [ '[[]]', maximumEvaluationDepth - 1, 100 ],
            [ '[42]', 0, 0 ],
            [ '[,]', 0, 0 ],
            [ '[missing]', 0, 100 ],
            [ '[...[]]', 0, 100 ]
        ] as const
    ) {
        test(`rejects ${content} at depth ${depth} with ${fuel} steps`, function () {
            assert.strictEqual(
                evaluateArray(arrayExpression(content), createBoundedEvaluationContext(depth, fuel)),
                undefined
            );
        });
    }

    test('charges entries even when their value has an independent proof', function () {
        const context = {
            ...createBoundedEvaluationContext(0, 0),
            evaluate() {
                return { value: 42 };
            }
        };
        assert.strictEqual(evaluateArray(arrayExpression('[42]'), context), undefined);
    });

    test('retains sparse lengths without assuming inherited hole values', function () {
        const array = evaluatedArray('[,42]');
        assert.deepStrictEqual(array.propertyReference('length')?.value, { value: 2 });
        assert.strictEqual(array.propertyReference('0'), undefined);
        assert.strictEqual(array.propertyReference('missing'), undefined);
    });

    test('shares updates to existing entries', function () {
        const array = evaluatedArray('[21]');
        const reference = array.propertyReference('0');
        assertDefined(reference);
        assert.deepStrictEqual(reference.assign({ value: 42 }), { value: 42 });
        assert.deepStrictEqual(array.propertyReference('0')?.value, { value: 42 });
    });

    test('rejects length writes without changing the known length', function () {
        const array = evaluatedArray('[21]');
        const reference = array.propertyReference('length');
        assertDefined(reference);
        assert.strictEqual(reference.assign({ value: 2 }), undefined);
        assert.deepStrictEqual(reference.value, { value: 1 });
    });
});
