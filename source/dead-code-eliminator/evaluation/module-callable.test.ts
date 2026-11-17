import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { moduleCallable } from './module-callable.ts';

suite('module callable eligibility', function () {
    for (
        const [ content, kind, accepted ] of [
            [ 'const value=()=>42;', SyntaxKind.VariableDeclaration, true ],
            [ 'let value=()=>42;', SyntaxKind.VariableDeclaration, false ],
            [ 'export default function(){return 42;}', SyntaxKind.FunctionDeclaration, false ],
            [ 'const {value}=()=>42;', SyntaxKind.VariableDeclaration, false ]
        ] as const
    ) {
        test(`requires a stable named callable in ${content}`, function () {
            const source = createProject().createSourceFile('input.js', content);
            const declaration = source.getFirstDescendantByKindOrThrow(kind);
            const target = moduleCallable(declaration);
            assert.strictEqual(target !== undefined, accepted);
            if (accepted) {
                assert.strictEqual(target?.getText(), '()=>42');
            }
        });
    }
});
