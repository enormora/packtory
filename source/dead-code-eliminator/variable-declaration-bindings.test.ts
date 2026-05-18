import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind, type VariableDeclaration } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import { collectVariableDeclarationBindings, variableDeclarationSurvives } from './variable-declaration-bindings.ts';

function declaratorFor(content: string): VariableDeclaration {
    const project = createProject({ withFiles: [{ filePath: '/source.ts', content }] });
    const sourceFile = project.getSourceFileOrThrow('/source.ts');
    return sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.VariableDeclaration);
}

suite('variable-declaration-bindings', function () {
    test('collectVariableDeclarationBindings returns a single identifier binding for a simple declarator', function () {
        const declarator = declaratorFor('const x = 1;');

        const bindings = collectVariableDeclarationBindings(declarator);

        assert.deepStrictEqual(
            bindings.map((binding) => binding.name),
            ['x']
        );
    });

    test('collectVariableDeclarationBindings flattens an array destructuring pattern into one binding per element', function () {
        const declarator = declaratorFor('const [a, b] = [1, 2];');

        const bindings = collectVariableDeclarationBindings(declarator);

        assert.deepStrictEqual(
            bindings.map((binding) => binding.name),
            ['a', 'b']
        );
    });

    test('collectVariableDeclarationBindings flattens an object destructuring pattern into one binding per property', function () {
        const declarator = declaratorFor('const { a, b: renamed } = { a: 1, b: 2 };');

        const bindings = collectVariableDeclarationBindings(declarator);

        assert.deepStrictEqual(
            bindings.map((binding) => binding.name),
            ['a', 'renamed']
        );
    });

    test('variableDeclarationSurvives returns true when any declared name is in the surviving set', function () {
        const declarator = declaratorFor('const [a, b] = [1, 2];');

        assert.strictEqual(variableDeclarationSurvives(declarator, new Set(['b'])), true);
    });

    test('variableDeclarationSurvives returns false when no declared name is in the surviving set', function () {
        const declarator = declaratorFor('const [a, b] = [1, 2];');

        assert.strictEqual(variableDeclarationSurvives(declarator, new Set(['c'])), false);
    });
});
