import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { Node as TypeScriptMorphNode, Statement } from 'ts-morph';
import {
    bindingIdentifier,
    buildBindingsByFile,
    buildDeclarationNodeIndex,
    buildNodeByIdentifier,
    type FileBindingSet
} from './binding-identifier.ts';
import type { BindingDescriptor } from './binding-extractor.ts';
import type { DeclarationNodeIndex } from './identifier-target-collector.ts';

const declarationStub = { identifier: 'decl' };
const referenceStub = { identifier: 'ref' };
const statementStub = { identifier: 'statement' };

function descriptor(name: string, overrides: Partial<BindingDescriptor> = {}): BindingDescriptor {
    return {
        name,

        declarationNode: declarationStub as unknown as TypeScriptMorphNode,

        referenceNode: referenceStub as unknown as TypeScriptMorphNode,

        statement: statementStub as unknown as Statement,
        isExported: false,
        ...overrides
    };
}

function fileBindings(inputFilePath: string, bindings: readonly BindingDescriptor[]): FileBindingSet {
    return {
        inputFilePath,
        parsedInputFilePath: inputFilePath,
        targetFilePath: inputFilePath,
        moduleReferences: [],
        bindings
    };
}

type CompanionIndexFixtureOptions = {
    readonly declarationBindingName: string;
    readonly declarationFilePath: string;
    readonly runtimeBindingName: string;
};

type CompanionIndexFixture = {
    readonly declarationNode: TypeScriptMorphNode;
    readonly index: DeclarationNodeIndex;
};

function companionIndexFixture(options: CompanionIndexFixtureOptions): CompanionIndexFixture {
    const runtimeDeclaration = { identifier: 'runtime-decl' };
    const declarationDeclaration = { identifier: 'declaration-decl' };
    const runtimeBinding = descriptor(options.runtimeBindingName, {
        declarationNode: runtimeDeclaration as unknown as TypeScriptMorphNode
    });
    const declarationBinding = descriptor(options.declarationBindingName, {
        declarationNode: declarationDeclaration as unknown as TypeScriptMorphNode
    });

    return {
        declarationNode: declarationDeclaration as unknown as TypeScriptMorphNode,
        index: buildDeclarationNodeIndex([
            fileBindings('/source/shared.js', [ runtimeBinding ]),
            fileBindings(options.declarationFilePath, [ declarationBinding ])
        ])
    };
}

suite('binding-id', function () {
    test('bindingIdentifier joins the file path and name with a double colon delimiter', function () {
        assert.strictEqual(bindingIdentifier('/source/a.ts', 'foo'), '/source/a.ts::foo');
    });

    test('buildDeclarationNodeIndex maps every declaration node to its binding id', function () {
        const declarationA = { identifier: 'decl-a' };
        const declarationB = { identifier: 'decl-b' };

        const bindingA = descriptor('a', { declarationNode: declarationA as unknown as TypeScriptMorphNode });

        const bindingB = descriptor('b', { declarationNode: declarationB as unknown as TypeScriptMorphNode });
        const index = buildDeclarationNodeIndex([ fileBindings('/source/a.ts', [ bindingA, bindingB ]) ]);
        assert.strictEqual(index.identifiersByNode.size, 2);
        assert.deepStrictEqual(index.identifiersByNode.get(declarationA as unknown as TypeScriptMorphNode), [
            '/source/a.ts::a'
        ]);

        assert.deepStrictEqual(index.identifiersByNode.get(declarationB as unknown as TypeScriptMorphNode), [
            '/source/a.ts::b'
        ]);
    });

    test('buildDeclarationNodeIndex maps declaration companions to same-named runtime bindings', function () {
        const { declarationNode, index } = companionIndexFixture({
            declarationBindingName: 'configuration',
            declarationFilePath: '/source/shared.d.ts',
            runtimeBindingName: 'configuration'
        });

        assert.deepStrictEqual(index.identifiersByNode.get(declarationNode), [
            '/source/shared.d.ts::configuration',
            '/source/shared.js::configuration'
        ]);
        assert.deepStrictEqual(index.identifiersByFileAndName.get('/source/shared.d.ts')?.get('configuration'), [
            '/source/shared.d.ts::configuration',
            '/source/shared.js::configuration'
        ]);
    });

    test('buildDeclarationNodeIndex ignores declaration companions without a same-named runtime binding', function () {
        const { declarationNode, index } = companionIndexFixture({
            declarationBindingName: 'configuration',
            declarationFilePath: '/source/shared.d.ts',
            runtimeBindingName: 'other'
        });

        assert.deepStrictEqual(index.identifiersByNode.get(declarationNode), [
            '/source/shared.d.ts::configuration'
        ]);
    });

    test('buildDeclarationNodeIndex ignores files without a declaration companion relationship', function () {
        const { declarationNode, index } = companionIndexFixture({
            declarationBindingName: 'configuration',
            declarationFilePath: '/source/shared.txt',
            runtimeBindingName: 'configuration'
        });

        assert.deepStrictEqual(index.identifiersByNode.get(declarationNode), [
            '/source/shared.txt::configuration'
        ]);
    });

    test('buildDeclarationNodeIndex maps parsed declaration source paths to target files', function () {
        const declarationNode = {
            getSourceFile() {
                return {
                    getFilePath() {
                        return '/authored/index.ts';
                    }
                };
            }
        };
        const binding = descriptor('api', { declarationNode: declarationNode as unknown as TypeScriptMorphNode });

        const index = buildDeclarationNodeIndex([
            {
                inputFilePath: '/generated/index.js',
                parsedInputFilePath: '/virtual/index.js',
                targetFilePath: 'index.js',
                moduleReferences: [],
                bindings: [ binding ]
            }
        ]);

        assert.deepStrictEqual(index.identifiersByFileAndName.get('/authored/index.ts')?.get('api'), [
            'index.js::api'
        ]);
        assert.strictEqual(index.targetFilePathByInputFilePath.get('/authored/index.ts'), 'index.js');
    });

    test('buildDeclarationNodeIndex ignores declarations without source file paths', function () {
        const index = buildDeclarationNodeIndex([
            {
                inputFilePath: '/generated/index.js',
                parsedInputFilePath: '/virtual/index.js',
                targetFilePath: 'index.js',
                moduleReferences: [],
                bindings: [ descriptor('api') ]
            }
        ]);

        assert.strictEqual(index.identifiersByFileAndName.has('Stryker was here'), false);
        assert.strictEqual(index.targetFilePathByInputFilePath.has('Stryker was here'), false);
        assert.strictEqual(index.identifiersByFileAndName.has(undefined as unknown as string), false);
        assert.strictEqual(index.targetFilePathByInputFilePath.has(undefined as unknown as string), false);
    });

    test('buildBindingsByFile groups binding ids by their source file', function () {
        const result = buildBindingsByFile([
            fileBindings('/source/a.ts', [ descriptor('a'), descriptor('b') ]),
            fileBindings('/source/b.ts', [ descriptor('c') ])
        ]);

        assert.deepStrictEqual(result.get('/source/a.ts'), new Set([ '/source/a.ts::a', '/source/a.ts::b' ]));
        assert.deepStrictEqual(result.get('/source/b.ts'), new Set([ '/source/b.ts::c' ]));
    });

    test('buildNodeByIdentifier maps every binding id back to its reference node', function () {
        const referenceA = { identifier: 'ref-a' };

        const bindingA = descriptor('a', { referenceNode: referenceA as unknown as TypeScriptMorphNode });
        const map = buildNodeByIdentifier([ fileBindings('/source/a.ts', [ bindingA ]) ]);

        assert.strictEqual(map.get('/source/a.ts::a'), referenceA as unknown as TypeScriptMorphNode);
    });
});
