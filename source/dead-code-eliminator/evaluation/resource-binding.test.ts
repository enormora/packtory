import assert from 'node:assert';
import { suite, test } from 'mocha';
import { VariableDeclarationKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { resourceDeclarationIsHarmless } from './resource-binding.ts';

suite('resource declaration evaluation', function () {
    test('does not evaluate a missing initializer', function () {
        const source = createProject().createSourceFile('input.ts', 'using resource;');
        const declaration = source.getVariableDeclarationOrThrow('resource');
        assert.strictEqual(
            resourceDeclarationIsHarmless(VariableDeclarationKind.Using, declaration, function () {
                return assert.fail('A missing initializer cannot be evaluated');
            }),
            false
        );
    });
});
