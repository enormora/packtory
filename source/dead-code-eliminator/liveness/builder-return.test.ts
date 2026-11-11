import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { objectDataShapeIsKnown, objectMemberName, returnCreationIsPure } from './builder-return.ts';

suite('builder object shapes', function () {
    test('requires identifier reads when checking parameter values', function () {
        const source = createProject().createSourceFile('input.ts', 'const object={value:1};object.value;');
        const expression = source.getFirstDescendantByKindOrThrow(SyntaxKind.PropertyAccessExpression);
        const property = source.getFirstDescendantByKindOrThrow(SyntaxKind.PropertyAssignment);
        assert.strictEqual(returnCreationIsPure(expression, new Set([ property ])), false);
    });

    test('recognizes a parameter among merged declarations', function () {
        const source = createProject().createSourceFile('input.ts', 'function run(value){var value;return value;}');
        const target = source.getFunctionOrThrow('run');
        const expression = target.getFirstDescendantByKindOrThrow(SyntaxKind.ReturnStatement).getExpressionOrThrow();
        assert.strictEqual(returnCreationIsPure(expression, new Set(target.getParameters())), true);
    });

    for (
        const [ content, expected ] of [
            [ '{first:1,second(){return 2;}}', true ],
            [ '{answer:1,answer:2}', false ],
            [ '{1:1,"1":2}', false ],
            [ '{answer,answer}', false ],
            [ '{[name]:42}', false ]
        ] as const
    ) {
        test(`checks field uniqueness in ${content}`, function () {
            const source = createProject().createSourceFile('input.ts', `(${content});`);
            const object = source.getFirstDescendantByKindOrThrow(SyntaxKind.ObjectLiteralExpression);
            assert.strictEqual(objectDataShapeIsKnown(object), expected);
        });
    }

    test('preserves the source spelling of computed member names', function () {
        const source = createProject().createSourceFile('input.ts', '({[name](){return 42;}});');
        const method = source.getFirstDescendantByKindOrThrow(SyntaxKind.MethodDeclaration);
        assert.strictEqual(objectMemberName(method), '[name]');
    });
});
