import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import {
    referenceAliasName,
    referenceDeclaresBinding,
    referenceMayUseBinding,
    referenceTarget,
    createBindingReferenceResolver
} from './reference-target.ts';

suite('reference targets', function () {
    for (const populated of [ true, false ]) {
        test(`caches and deduplicates binding references when populated is ${populated}`, function () {
            const source = createProject().createSourceFile('input.ts', 'const value=1;const observed=value;');
            const name = source.getVariableDeclarationOrThrow('value').getNameNode().asKindOrThrow(
                SyntaxKind.Identifier
            );
            const read = source.getVariableDeclarationOrThrow('observed').getInitializerOrThrow();
            let reads = 0;
            const references = createBindingReferenceResolver(function (binding) {
                assert.strictEqual(binding, name);
                reads += 1;
                assert.strictEqual(reads, 1);
                return populated ? [ name, name, read, read, undefined ] : [];
            });
            const result = references(name);
            assert.deepStrictEqual(result, populated ? [ read, undefined ] : []);
            assert.strictEqual(references(name), result);
            assert.strictEqual(reads, 1);
        });
    }

    suite('binding identities', function () {
        test('keeps non-identifier export references conservative even when they resolve to another binding', function () {
            const source = createProject().createSourceFile(
                'input.ts',
                'const binding={};const other={};export {other as "public value"};'
            );
            const declaration = source.getVariableDeclarationOrThrow('binding');
            const reference = source.getFirstDescendantByKindOrThrow(SyntaxKind.StringLiteral);
            assert.strictEqual(referenceMayUseBinding(reference, declaration), true);
        });

        test('does not treat unnamed function return types as declaration names', function () {
            const source = createProject().createSourceFile('input.ts', 'export default function (): Result {}');
            const read = source.getFirstDescendantByKindOrThrow(SyntaxKind.Identifier);
            assert.strictEqual(referenceDeclaresBinding(read), false);
        });

        test('keeps anonymous default export keywords outside binding names', function () {
            const source = createProject().createSourceFile('input.ts', 'export default function(){}');
            const keyword = source.getFirstDescendantByKindOrThrow(SyntaxKind.DefaultKeyword);
            assert.strictEqual(referenceDeclaresBinding(keyword), false);
        });

        test('does not treat uninitialized names as alias reads', function () {
            const source = createProject().createSourceFile('input.ts', 'let value;');
            const name = source.getVariableDeclarationOrThrow('value').getNameNode();
            assert.strictEqual(referenceAliasName(name), undefined);
        });

        test('does not treat a name with an initializer as an alias read', function () {
            const source = createProject().createSourceFile('input.ts', 'const value = other;');
            const declaration = source.getVariableDeclarationOrThrow('value');
            assert.strictEqual(referenceAliasName(declaration.getNameNode()), undefined);
            assert.strictEqual(referenceAliasName(declaration.getInitializerOrThrow()), declaration.getNameNode());
        });
    });

    test('returns the source boundary for a reference whose text was removed', function () {
        const source = createProject().createSourceFile('input.ts', 'const value = 1; value;');
        const name = source.getVariableDeclarationOrThrow('value').getNameNode().asKindOrThrow(SyntaxKind.Identifier);
        const reference = name.findReferences()[0]?.getReferences()[0];
        assertDefined(reference);
        source.replaceWithText('');
        assert.strictEqual(referenceTarget(reference), source);
    });

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
        assert.strictEqual(referenceTarget(reference).getText(), '"public value"');
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
        assert.strictEqual(referenceTarget(read).getText(), 'x');
    });

    test('resolves an exported arrow binding without consuming its initializer', function () {
        const source = createProject().createSourceFile('index.js', 'export const expression = () => ({});');
        const name = source.getVariableDeclarationOrThrow('expression').getNameNode().asKindOrThrow(
            SyntaxKind.Identifier
        );
        const references = name.findReferences();
        const definition = references[0]?.getReferences()[0];
        assertDefined(definition);
        assert.strictEqual(referenceTarget(definition).getText(), 'expression');
    });
});
