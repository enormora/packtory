import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createObservedProject, createProject } from '../test-libraries/typescript-project.ts';
import { resolveImportedExpressionPropertyPath } from './imported-expression-origin.ts';

suite('imported origin analysis work', function () {
    test('resolves import bindings inside ambient module declarations', function () {
        const project = createProject();
        const source = project.createSourceFile(
            'input.d.ts',
            'declare module "container" { import {value} from "lib";export const result:typeof value; }'
        );
        const expression = source
            .getFirstDescendantByKindOrThrow(SyntaxKind.TypeQuery)
            .getFirstDescendantByKindOrThrow(SyntaxKind.Identifier);

        assert.deepStrictEqual(resolveImportedExpressionPropertyPath(expression), { from: 'lib', path: [ 'value' ] });
    });

    test('does not treat a label with an imported name as an import read', function () {
        const source = createProject().createSourceFile('input.js', 'import {value} from "lib";value:{break value;}');
        const label = source.getFirstDescendantByKindOrThrow(SyntaxKind.LabeledStatement).getLabel();

        assert.strictEqual(resolveImportedExpressionPropertyPath(label), undefined);
    });

    for (const name of [ 'local', 'external' ]) {
        test(`does not load semantic dependencies for the local binding ${name}`, async function () {
            const dependencyPath = '/project/dependency.js';
            const { project, assertUnread } = await createObservedProject([
                { filePath: dependencyPath, content: 'export const external = 42;' }
            ]);
            const source = project.createSourceFile(
                '/project/index.js',
                `import {external as binding} from './dependency.js';const ${name}=1;export const result=${name};`
            );
            assert.strictEqual(
                resolveImportedExpressionPropertyPath(
                    source.getVariableDeclarationOrThrow('result').getInitializerOrThrow()
                ),
                undefined
            );
            assertUnread(dependencyPath);
        });
    }
});
