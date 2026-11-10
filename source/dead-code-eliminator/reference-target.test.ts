import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { referenceMayUseBinding, referenceTarget } from './reference-target.ts';

suite('reference targets', function () {
    test('resolves quoted export names whose reference spans omit the quotes', function () {
        const content = 'const value={};export {value as "public value"};';
        const source = createProject().createSourceFile('input.ts', content);
        const name = source.getVariableDeclarationOrThrow('value').getNameNode().asKindOrThrow(SyntaxKind.Identifier);
        const reference = name
            .findReferences()
            .flatMap(function (group) {
                return group.getReferences();
            })
            .find(function (entry) {
                return entry.getTextSpan().getLength() === 'public value'.length;
            });
        assertDefined(reference);
        assert.strictEqual(referenceTarget(reference)?.getText(), '"public value"');
    });

    for (
        const [ content, expected ] of [
            [ 'const binding={};const read=42;', true ],
            [ 'const binding={};const read=missing;', true ],
            [ 'const binding={};const read=binding;', true ],
            [ 'const binding={};const other={};const read=other;', false ]
        ] as const
    ) {
        test(`resolves possible binding observations in ${content}`, function () {
            const source = createProject().createSourceFile('input.ts', content);
            const binding = source.getVariableDeclarationOrThrow('binding');
            const read = source.getVariableDeclarationOrThrow('read').getInitializerOrThrow();
            assert.strictEqual(referenceMayUseBinding(read, binding), expected);
        });
    }

    test('follows imported aliases to their defining binding', function () {
        const project = createProject({
            withFiles: [
                { filePath: '/source/provider.js', content: 'export const binding={};' },
                {
                    filePath: '/source/index.js',
                    content: 'import {binding as local} from "./provider.js";const read=local;'
                }
            ]
        });
        const binding = project.getSourceFileOrThrow('/source/provider.js').getVariableDeclarationOrThrow('binding');
        const read = project
            .getSourceFileOrThrow('/source/index.js')
            .getVariableDeclarationOrThrow('read')
            .getInitializerOrThrow();
        assert.strictEqual(referenceMayUseBinding(read, binding), true);
    });

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
