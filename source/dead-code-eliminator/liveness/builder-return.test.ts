import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { objectDataShapeIsKnown, objectMemberName } from './builder-return.ts';

suite('builder object shapes', function () {
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
