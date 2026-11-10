import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { referenceTarget } from './reference-target.ts';

suite('reference targets', function () {
    test('resolves a short receiver without consuming its enclosing call', function () {
        const source = createProject().createSourceFile(
            'index.js',
            'const x=null; const unused=x?.method(console.log("no")); export const value=42;'
        );
        const name = source.getVariableDeclarationOrThrow('x').getNameNode().asKindOrThrow(SyntaxKind.Identifier);
        const references = name.findReferences();
        const read = references
            .flatMap(function (group) {
                return group.getReferences();
            })
            .find(function (reference) {
                return !reference.isWriteAccess();
            });
        assertDefined(read);
        assert.strictEqual(referenceTarget(read)?.getText(), 'x');
    });

    test('resolves an exported arrow binding without consuming its initializer', function () {
        const source = createProject().createSourceFile('index.js', 'export const expression = () => ({});');
        const name = source.getVariableDeclarationOrThrow('expression').getNameNode().asKindOrThrow(
            SyntaxKind.Identifier
        );
        const references = name.findReferences();
        const definition = references[0]?.getReferences()[0];
        assertDefined(definition);
        assert.strictEqual(referenceTarget(definition)?.getText(), 'expression');
    });
});
