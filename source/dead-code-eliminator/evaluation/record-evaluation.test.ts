import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createBoundedEvaluationContext } from '../../test-libraries/bounded-evaluation-context.ts';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { maximumEvaluationDepth } from './evaluation-context.ts';
import { evaluateExpression } from './expression-evaluation.ts';
import { evaluateRecordExpression, recordPropertyReference } from './record-evaluation.ts';

suite('record evaluation limits', function () {
    test('charges each field even when its initializer has an independent proof', function () {
        const source = createProject().createSourceFile('input.ts', '({answer:42});');
        const object = source.getFirstDescendantByKindOrThrow(SyntaxKind.ObjectLiteralExpression);
        const context = {
            ...createBoundedEvaluationContext(0, 0),
            evaluate() {
                return { value: 42 };
            }
        };
        assert.strictEqual(evaluateRecordExpression(object, context), undefined);
    });

    test('rejects unknown shorthand field values before allocating a record', function () {
        const source = createProject().createSourceFile('input.ts', '({missing});');
        const object = source.getFirstDescendantByKindOrThrow(SyntaxKind.ObjectLiteralExpression);
        assert.strictEqual(evaluateRecordExpression(object, createBoundedEvaluationContext(0, 100)), undefined);
    });

    for (const content of [ 'missing.answer;', '(42).answer;', '({__proto__:null})[missing];' ]) {
        test(`rejects unproved record references in ${content}`, function () {
            const source = createProject().createSourceFile('input.ts', content);
            const expression = source.getFirstDescendantByKindOrThrow(SyntaxKind.ExpressionStatement).getExpression();
            assert.strictEqual(recordPropertyReference(expression, createBoundedEvaluationContext(0, 100)), undefined);
        });
    }

    test('counts nested record allocations against the same depth limit', function () {
        const source = createProject().createSourceFile('input.ts', '({nested:{answer:42}});');
        const object = source.getFirstDescendantByKindOrThrow(SyntaxKind.ObjectLiteralExpression);
        assert.strictEqual(
            evaluateRecordExpression(object, createBoundedEvaluationContext(maximumEvaluationDepth - 1, 100)),
            undefined
        );
    });

    test('rejects syntax nodes that cannot produce expression values', function () {
        const source = createProject().createSourceFile('input.ts', 'const answer=42;');
        assert.strictEqual(
            evaluateExpression(source.getVariableDeclarationOrThrow('answer'), createBoundedEvaluationContext(0, 100)),
            undefined
        );
    });

    test('does not allocate records after exhausting the depth budget', function () {
        const source = createProject().createSourceFile('input.ts', '({answer:42});');
        const object = source.getFirstDescendantByKindOrThrow(SyntaxKind.ObjectLiteralExpression);
        assert.strictEqual(
            evaluateRecordExpression(object, createBoundedEvaluationContext(maximumEvaluationDepth, 100)),
            undefined
        );
        const value = evaluateRecordExpression(object, createBoundedEvaluationContext(maximumEvaluationDepth - 1, 100));
        assert.strictEqual(typeof value?.value, 'object');
    });

    test('does not allocate a field after exhausting evaluation steps', function () {
        const source = createProject().createSourceFile('input.ts', '({answer:42});');
        const object = source.getFirstDescendantByKindOrThrow(SyntaxKind.ObjectLiteralExpression);
        assert.strictEqual(evaluateRecordExpression(object, createBoundedEvaluationContext(0, 0)), undefined);
        const value = evaluateRecordExpression(object, createBoundedEvaluationContext(0, 100));
        assert.strictEqual(typeof value?.value, 'object');
    });

    test('rejects element references without a key', function () {
        const source = createProject().createSourceFile('input.ts', '({answer:42})[];');
        const expression = source.getFirstDescendantByKindOrThrow(SyntaxKind.ElementAccessExpression);
        assert.strictEqual(recordPropertyReference(expression, createBoundedEvaluationContext(0, 100)), undefined);
    });
});
