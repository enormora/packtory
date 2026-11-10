import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import {
    bindingHasOnlyUses,
    bindingShapeIsStable,
    expressionBindingShapeIsStable
} from './binding-stability.ts';

suite('binding stability', function () {
    for (
        const [ name, content, expected ] of [
            [ 'cyclic aliases without escape', 'const object=alias;const alias=object;', true ],
            [ 'destructured alias', 'const object={};const {value}=object;consume(value);', false ],
            [ 'declaration name without initializer', 'let object;object={};', false ],
            [ 'arrow member', 'const object={read:()=>1};object.read();', true ],
            [ 'function member', 'const object={read:function(){return 1;}};object.read();', true ],
            [ 'non-callable member', 'const object={read:1};object.read();', false ],
            [ 'accessor member', 'const object={get read(){return ()=>1;}};object.read();', false ],
            [ 'cyclic aliases with an escaping read', 'const object=alias;const alias=object;consume(object);', false ]
        ] as const
    ) {
        test(name, function () {
            const source = createProject().createSourceFile('input.ts', content);
            const nameNode = source
                .getVariableDeclarationOrThrow('object')
                .getNameNode()
                .asKindOrThrow(SyntaxKind.Identifier);
            assert.strictEqual(
                bindingShapeIsStable(nameNode, function () {
                    return false;
                }),
                expected
            );
        });
    }

    test('does not infer runtime calls from declarations', function () {
        const project = createProject({
            withFiles: [
                { filePath: '/source/types.d.ts', content: 'export declare function read():number;' },
                { filePath: '/source/index.ts', content: 'import * as object from "./types.js";object.read();' }
            ]
        });
        const source = project.getSourceFileOrThrow('/source/index.ts');
        const name = source.getImportDeclarations()[0]?.getNamespaceImport();
        assertDefined(name);
        assert.strictEqual(
            bindingShapeIsStable(name, function () {
                return false;
            }),
            false
        );
    });

    test('does not claim primitive expressions have stable bindings', function () {
        const source = createProject().createSourceFile('input.ts', 'const value=1;');
        assert.strictEqual(
            expressionBindingShapeIsStable(
                source.getVariableDeclarationOrThrow('value').getInitializerOrThrow(),
                function () {
                    return false;
                }
            ),
            false
        );
    });

    for (
        const content of [
            'const value={};export {value};',
            'const value={};export {value as "public value"};'
        ]
    ) {
        test(`treats exported values as escaping in ${content}`, function () {
            const source = createProject().createSourceFile('/source/index.ts', content);
            const declaration = source.getVariableDeclarationOrThrow('value');
            assert.strictEqual(bindingHasOnlyUses(declaration.getNameNode(), declaration, new Set()), false);
        });
    }

    test('treats forwarded exports as escaping', function () {
        const project = createProject({
            withFiles: [
                { filePath: '/source/provider.ts', content: 'export const value={};' },
                { filePath: '/source/index.ts', content: 'export {value} from "./provider.js";' }
            ]
        });
        const declaration = project.getSourceFileOrThrow('/source/provider.ts').getVariableDeclarationOrThrow('value');
        assert.strictEqual(bindingHasOnlyUses(declaration.getNameNode(), declaration, new Set()), false);
    });

    test('resolves imported aliases when observing local uses', function () {
        const project = createProject({
            withFiles: [
                { filePath: '/source/provider.ts', content: 'export const value={};' },
                { filePath: '/source/index.ts', content: 'import {value as local} from "./provider.js";local;' }
            ]
        });
        const specifier = project
            .getSourceFileOrThrow('/source/index.ts')
            .getImportDeclarations()[0]
            ?.getNamedImports()[0];
        assertDefined(specifier);
        const name = specifier.getAliasNode();
        assertDefined(name);
        assert.strictEqual(bindingHasOnlyUses(name, specifier, new Set()), false);
    });

    suite('declaration boundaries', function () {
        test('rejects binding patterns and unrelated declarations', function () {
            const source = createProject().createSourceFile('input.ts', 'const [value]=[1];const other=2;');
            const declaration = source.getFirstDescendantByKindOrThrow(SyntaxKind.VariableDeclaration);
            const other = source.getVariableDeclarationOrThrow('other');
            assert.strictEqual(bindingHasOnlyUses(declaration.getNameNode(), declaration, new Set()), false);
            assert.strictEqual(bindingHasOnlyUses(other.getNameNode(), declaration, new Set()), false);
        });

        test('rejects names with merged declarations', function () {
            const source = createProject().createSourceFile('input.ts', 'var value;var value;');
            const declaration = source.getVariableDeclarations()[0];
            assertDefined(declaration);
            assert.strictEqual(bindingHasOnlyUses(declaration.getNameNode(), declaration, new Set()), false);
        });

        test('does not prove purity from a declaration-file body', function () {
            const project = createProject({
                withFiles: [
                    { filePath: '/source/types.d.ts', content: 'export function read() { return 1; }' },
                    { filePath: '/source/index.ts', content: 'import * as object from "./types.js";object.read();' }
                ]
            });
            const name = project
                .getSourceFileOrThrow('/source/index.ts')
                .getImportDeclarations()[0]
                ?.getNamespaceImport();
            assertDefined(name);
            assert.strictEqual(
                bindingShapeIsStable(name, function () {
                    return false;
                }),
                false
            );
        });

        test('does not prove missing declarations', function () {
            const source = createProject().createSourceFile('input.ts', 'const value=missing;');
            const declaration = source.getVariableDeclarationOrThrow('value');
            assert.strictEqual(bindingHasOnlyUses(declaration.getInitializerOrThrow(), declaration, new Set()), false);
        });
    });
});
