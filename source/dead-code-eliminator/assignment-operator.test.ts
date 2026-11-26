import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import { isAssignmentOperator } from './assignment-operator.ts';

function operatorOf(content: string): SyntaxKind {
    const source = createProject().createSourceFile('input.ts', content);
    return source.getFirstDescendantByKindOrThrow(SyntaxKind.BinaryExpression).getOperatorToken().getKind();
}

suite('assignment-operator', function () {
    for (const content of [ 'a = 1;', 'a += 1;', 'a ??= 1;', 'a ^= 1;' ]) {
        test(`treats ${content} as an assignment`, function () {
            assert.strictEqual(isAssignmentOperator(operatorOf(content)), true);
        });
    }

    for (const content of [ 'a + 1;', 'a, 1;', 'a === 1;', 'a in b;', 'a instanceof b;' ]) {
        test(`does not treat ${content} as an assignment`, function () {
            assert.strictEqual(isAssignmentOperator(operatorOf(content)), false);
        });
    }
});
