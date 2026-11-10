import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createBoundedEvaluationContext } from '../../test-libraries/bounded-evaluation-context.ts';
import { createBindingReference } from './evaluation-context.ts';
import { evaluateExpression } from './expression-evaluation.ts';

suite('expression evaluation writes', function () {
    test('preserves a binding when the assigned value cannot be evaluated', function () {
        const source = createProject().createSourceFile('input.ts', 'let value=1;value=missing;');
        const expression = source.getFirstDescendantByKindOrThrow(SyntaxKind.BinaryExpression);
        const reference = createBindingReference({ value: 1 }, true);
        const context = createBoundedEvaluationContext(0, 100);
        context.locals.set(source.getVariableDeclarationOrThrow('value'), reference);
        assert.strictEqual(evaluateExpression(expression, context), undefined);
        assert.deepStrictEqual(reference.value, { value: 1 });
    });

    test('rejects an unsupported compound assignment before evaluating its right operand', function () {
        const source = createProject().createSourceFile('input.ts', 'let value=1;value<<=expensive();');
        const expression = source.getFirstDescendantByKindOrThrow(SyntaxKind.BinaryExpression);
        const context = createBoundedEvaluationContext(0, 100);
        context.locals.set(source.getVariableDeclarationOrThrow('value'), createBindingReference({ value: 1 }, true));
        assert.strictEqual(
            evaluateExpression(expression, {
                ...context,
                evaluate() {
                    return assert.fail('Unsupported compound operators must not evaluate operands');
                }
            }),
            undefined
        );
    });
});
