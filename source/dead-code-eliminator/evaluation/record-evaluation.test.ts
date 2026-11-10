import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createLocalScope, maximumEvaluationDepth, type EvaluationContext } from './evaluation-context.ts';
import { evaluateExpression } from './expression-evaluation.ts';
import { evaluateStatement } from './statement-evaluation.ts';
import { evaluateRecordExpression, recordPropertyReference } from './record-evaluation.ts';

function recordContext(depth: number, fuel: number): EvaluationContext {
    let remaining = fuel;
    return {
        depth,
        locals: createLocalScope(new Map()),
        consume() {
            remaining -= 1;
            return remaining >= 0;
        },
        readConstant() {
            return undefined;
        },
        evaluate: evaluateExpression,
        execute: evaluateStatement,
        call() {
            return undefined;
        }
    };
}

suite('record evaluation limits', function () {
    for (const content of [ 'missing.answer;', '(42).answer;', '({__proto__:null})[missing];' ]) {
        test(`rejects unproved record references in ${content}`, function () {
            const source = createProject().createSourceFile('input.ts', content);
            const expression = source.getFirstDescendantByKindOrThrow(SyntaxKind.ExpressionStatement).getExpression();
            assert.strictEqual(recordPropertyReference(expression, recordContext(0, 100)), undefined);
        });
    }

    test('counts nested record allocations against the same depth limit', function () {
        const source = createProject().createSourceFile('input.ts', '({nested:{answer:42}});');
        const object = source.getFirstDescendantByKindOrThrow(SyntaxKind.ObjectLiteralExpression);
        assert.strictEqual(evaluateRecordExpression(object, recordContext(maximumEvaluationDepth - 1, 100)), undefined);
    });

    test('rejects syntax nodes that cannot produce expression values', function () {
        const source = createProject().createSourceFile('input.ts', 'const answer=42;');
        assert.strictEqual(
            evaluateExpression(source.getVariableDeclarationOrThrow('answer'), recordContext(0, 100)),
            undefined
        );
    });

    test('does not allocate records after exhausting the depth budget', function () {
        const source = createProject().createSourceFile('input.ts', '({answer:42});');
        const object = source.getFirstDescendantByKindOrThrow(SyntaxKind.ObjectLiteralExpression);
        assert.strictEqual(evaluateRecordExpression(object, recordContext(maximumEvaluationDepth, 100)), undefined);
        const value = evaluateRecordExpression(object, recordContext(maximumEvaluationDepth - 1, 100));
        assert.strictEqual(typeof value?.value, 'object');
    });

    test('does not allocate a field after exhausting evaluation steps', function () {
        const source = createProject().createSourceFile('input.ts', '({answer:42});');
        const object = source.getFirstDescendantByKindOrThrow(SyntaxKind.ObjectLiteralExpression);
        assert.strictEqual(evaluateRecordExpression(object, recordContext(0, 0)), undefined);
        const value = evaluateRecordExpression(object, recordContext(0, 100));
        assert.strictEqual(typeof value?.value, 'object');
    });

    test('rejects element references without a key', function () {
        const source = createProject().createSourceFile('input.ts', '({answer:42})[];');
        const expression = source.getFirstDescendantByKindOrThrow(SyntaxKind.ElementAccessExpression);
        assert.strictEqual(recordPropertyReference(expression, recordContext(0, 100)), undefined);
    });
});
