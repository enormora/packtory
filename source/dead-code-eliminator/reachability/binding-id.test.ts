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

suite('binding-id', function () {
    test('bindingId joins the file path and name with a double colon delimiter', function () {
        assert.strictEqual(bindingId('/src/a.ts', 'foo'), '/src/a.ts::foo');
    });

    test('buildDeclarationNodeIndex maps every declaration node to its binding id', function () {
        const declarationA = { id: 'decl-a' };
        const declarationB = { id: 'decl-b' };

        const a = descriptor('a', { declarationNode: declarationA as unknown as TsMorphNode });

        const b = descriptor('b', { declarationNode: declarationB as unknown as TsMorphNode });
        const index = buildDeclarationNodeIndex([fileBindings('/src/a.ts', [a, b])]);
        assert.strictEqual(index.get(declarationA as unknown as TsMorphNode), '/src/a.ts::a');

        assert.strictEqual(index.get(declarationB as unknown as TsMorphNode), '/src/a.ts::b');
    });

    test('buildBindingsByFile groups binding ids by their source file', function () {
        const result = buildBindingsByFile([
            fileBindings('/src/a.ts', [descriptor('a'), descriptor('b')]),
            fileBindings('/src/b.ts', [descriptor('c')])
        ]);

        assert.deepStrictEqual(result.get('/src/a.ts'), new Set(['/src/a.ts::a', '/src/a.ts::b']));
        assert.deepStrictEqual(result.get('/src/b.ts'), new Set(['/src/b.ts::c']));
    });

    test('buildNodeById maps every binding id back to its reference node', function () {
        const referenceA = { id: 'ref-a' };

        const a = descriptor('a', { referenceNode: referenceA as unknown as TsMorphNode });
        const map = buildNodeById([fileBindings('/src/a.ts', [a])]);

        assert.strictEqual(map.get('/src/a.ts::a'), referenceA as unknown as TsMorphNode);
    });
});
