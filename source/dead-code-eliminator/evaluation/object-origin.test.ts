import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { unescapedObjectOrigin } from './object-origin.ts';

suite('object origins', function () {
    test('rejects reads before a constant object is initialized', function () {
        const source = createProject().createSourceFile('input.ts', 'object;const object={answer:42};');
        const read = source.getFirstDescendantByKindOrThrow(SyntaxKind.ExpressionStatement).getExpression();
        assert.strictEqual(unescapedObjectOrigin(read), undefined);
    });

    test('keeps an absent initializer unknown', function () {
        assert.strictEqual(unescapedObjectOrigin(undefined), undefined);
    });

    for (
        const [ name, content, expected, createdAtRead ] of [
            [ 'inline object', '({answer:42});', '{answer:42}', true ],
            [ 'local constant', 'const object={answer:42};object;', '{answer:42}', false ],
            [ 'mutable binding', 'let object={answer:42};object;', undefined, false ],
            [ 'exported binding', 'export const object={answer:42};object;', undefined, false ],
            [ 'missing binding', 'object;', undefined, false ],
            [ 'primitive binding', 'const object=1;object;', undefined, false ],
            [ 'function binding', 'function object(){};object;', undefined, false ],
            [ 'escaped object', 'const object={answer:42};consume(object);object;', undefined, false ]
        ] as const
    ) {
        test(name, function () {
            const source = createProject().createSourceFile('input.ts', content);
            const expression = source
                .getStatements()
                .at(-1)
                ?.asKindOrThrow(SyntaxKind.ExpressionStatement)
                .getExpression();
            assertDefined(expression);
            const origin = unescapedObjectOrigin(expression);
            assert.strictEqual(origin?.object.getText(), expected);
            assert.strictEqual(origin?.creationIsAtRead ?? false, createdAtRead);
        });
    }
});
