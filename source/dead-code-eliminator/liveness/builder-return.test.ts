import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import {
    objectDataShapeIsKnown,
    objectMemberName,
    returnCreationIsPure,
    builderReturnExpression,
    staticPropertyName
} from './builder-return.ts';

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
        const creationIsPure = returnCreationIsPure(expression, new Set(target.getParameters()));
        assert.strictEqual(creationIsPure, true);
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

    for (
        const [ content, expected ] of [
            [ '{value:1,method(){return 2;}}', true ],
            [ '{[name]:1}', false ],
            [ '{value:missing}', false ]
        ] as const
    ) {
        test(`checks return creation purity of ${content}`, function () {
            const source = createProject().createSourceFile('input.js', `(${content});`);
            const object = source.getFirstDescendantByKindOrThrow(SyntaxKind.ObjectLiteralExpression);
            assert.strictEqual(returnCreationIsPure(object, new Set()), expected);
        });
    }

    test('preserves the source spelling of computed member names', function () {
        const source = createProject().createSourceFile('input.ts', '({[name](){return 42;}});');
        const method = source.getFirstDescendantByKindOrThrow(SyntaxKind.MethodDeclaration);
        assert.strictEqual(objectMemberName(method), '[name]');
    });

    suite('builder return boundaries', function () {
        test('skips directives and empty statements before a returned value', function () {
            const source = createProject().createSourceFile(
                'input.ts',
                'function build(value){;"use strict";return value;}'
            );
            assert.strictEqual(builderReturnExpression(source.getFunctionOrThrow('build'))?.getText(), 'value');
        });

        test('recognizes unquoted property names', function () {
            const source = createProject().createSourceFile('input.ts', '({answer:42});');
            const property = source.getFirstDescendantByKindOrThrow(SyntaxKind.PropertyAssignment);
            assert.strictEqual(staticPropertyName(property.getNameNode()), 'answer');
        });
    });

    suite('private property names', function () {
        test('keeps private names outside ordinary record keys', function () {
            const source = createProject().createSourceFile('input.ts', 'class Holder{#answer;}');
            assert.strictEqual(
                staticPropertyName(source.getFirstDescendantByKindOrThrow(SyntaxKind.PrivateIdentifier)),
                undefined
            );
        });
    });
});
