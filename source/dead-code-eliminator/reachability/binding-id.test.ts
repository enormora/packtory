import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { Node as TsMorphNode, Statement } from 'ts-morph';
import {
    bindingId,
    buildBindingsByFile,
    buildDeclarationNodeIndex,
    buildNodeById,
    type FileBindingSet
} from './binding-id.ts';
import type { BindingDescriptor } from './binding-extractor.ts';
import type { DeclarationNodeIndex } from './identifier-target-collector.ts';

const declarationStub = { id: 'decl' };
const referenceStub = { id: 'ref' };
const statementStub = { id: 'statement' };

function descriptor(name: string, overrides: Partial<BindingDescriptor> = {}): BindingDescriptor {
    return {
        name,

        declarationNode: declarationStub as unknown as TsMorphNode,

        referenceNode: referenceStub as unknown as TsMorphNode,

        statement: statementStub as unknown as Statement,
        isExported: false,
        ...overrides
    };
}

function fileBindings(sourceFilePath: string, bindings: readonly BindingDescriptor[]): FileBindingSet {
    return { sourceFilePath, bindings };
}

type CompanionIndexFixtureOptions = {
    readonly declarationBindingName: string;
    readonly declarationFilePath: string;
    readonly runtimeBindingName: string;
};

type CompanionIndexFixture = {
    readonly declarationNode: TsMorphNode;
    readonly index: DeclarationNodeIndex;
};

function companionIndexFixture(options: CompanionIndexFixtureOptions): CompanionIndexFixture {
    const runtimeDeclaration = { id: 'runtime-decl' };
    const declarationDeclaration = { id: 'declaration-decl' };
    const runtimeBinding = descriptor(options.runtimeBindingName, {
        declarationNode: runtimeDeclaration as unknown as TsMorphNode
    });
    const declarationBinding = descriptor(options.declarationBindingName, {
        declarationNode: declarationDeclaration as unknown as TsMorphNode
    });

    return {
        declarationNode: declarationDeclaration as unknown as TsMorphNode,
        index: buildDeclarationNodeIndex([
            fileBindings('/src/shared.js', [ runtimeBinding ]),
            fileBindings(options.declarationFilePath, [ declarationBinding ])
        ])
    };
}

suite('binding-id', function () {
    test('bindingId joins the file path and name with a double colon delimiter', function () {
        assert.strictEqual(bindingId('/src/a.ts', 'foo'), '/src/a.ts::foo');
    });

    test('buildDeclarationNodeIndex maps every declaration node to its binding id', function () {
        const declarationA = { id: 'decl-a' };
        const declarationB = { id: 'decl-b' };

        const bindingA = descriptor('a', { declarationNode: declarationA as unknown as TsMorphNode });

        const bindingB = descriptor('b', { declarationNode: declarationB as unknown as TsMorphNode });
        const index = buildDeclarationNodeIndex([ fileBindings('/src/a.ts', [ bindingA, bindingB ]) ]);
        assert.deepStrictEqual(index.idsByNode.get(declarationA as unknown as TsMorphNode), [ '/src/a.ts::a' ]);

        assert.deepStrictEqual(index.idsByNode.get(declarationB as unknown as TsMorphNode), [ '/src/a.ts::b' ]);
    });

    test('buildDeclarationNodeIndex maps declaration companions to same-named runtime bindings', function () {
        const { declarationNode, index } = companionIndexFixture({
            declarationBindingName: 'config',
            declarationFilePath: '/src/shared.d.ts',
            runtimeBindingName: 'config'
        });

        assert.deepStrictEqual(index.idsByNode.get(declarationNode), [
            '/src/shared.d.ts::config',
            '/src/shared.js::config'
        ]);
        assert.deepStrictEqual(index.idsByFileAndName.get('/src/shared.d.ts')?.get('config'), [
            '/src/shared.d.ts::config',
            '/src/shared.js::config'
        ]);
    });

    test('buildDeclarationNodeIndex ignores declaration companions without a same-named runtime binding', function () {
        const { declarationNode, index } = companionIndexFixture({
            declarationBindingName: 'config',
            declarationFilePath: '/src/shared.d.ts',
            runtimeBindingName: 'other'
        });

        assert.deepStrictEqual(index.idsByNode.get(declarationNode), [
            '/src/shared.d.ts::config'
        ]);
    });

    test('buildDeclarationNodeIndex ignores files without a declaration companion relationship', function () {
        const { declarationNode, index } = companionIndexFixture({
            declarationBindingName: 'config',
            declarationFilePath: '/src/shared.txt',
            runtimeBindingName: 'config'
        });

        assert.deepStrictEqual(index.idsByNode.get(declarationNode), [
            '/src/shared.txt::config'
        ]);
    });

    test('buildBindingsByFile groups binding ids by their source file', function () {
        const result = buildBindingsByFile([
            fileBindings('/src/a.ts', [ descriptor('a'), descriptor('b') ]),
            fileBindings('/src/b.ts', [ descriptor('c') ])
        ]);

        assert.deepStrictEqual(result.get('/src/a.ts'), new Set([ '/src/a.ts::a', '/src/a.ts::b' ]));
        assert.deepStrictEqual(result.get('/src/b.ts'), new Set([ '/src/b.ts::c' ]));
    });

    test('buildNodeById maps every binding id back to its reference node', function () {
        const referenceA = { id: 'ref-a' };

        const bindingA = descriptor('a', { referenceNode: referenceA as unknown as TsMorphNode });
        const map = buildNodeById([ fileBindings('/src/a.ts', [ bindingA ]) ]);

        assert.strictEqual(map.get('/src/a.ts::a'), referenceA as unknown as TsMorphNode);
    });
});
