import assert from 'node:assert';
import type { Node as TsMorphNode, SourceFile, Statement } from 'ts-morph';
import { test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import type { BindingDescriptor } from './binding-extractor.ts';
import { buildDeclarationNodeIndex } from './binding-id.ts';
import { gatherLocalSeeds, type FileBindings } from './local-seed-gathering.ts';

function sourceFileFor(content: string): SourceFile {
    const project = createProject({ withFiles: [{ filePath: 'index.ts', content }] });
    return project.getSourceFileOrThrow('index.ts');
}

function fileBindings(
    sourceFilePath: string,
    sourceFile: SourceFile,
    bindings: readonly BindingDescriptor[]
): FileBindings {
    return { sourceFilePath, sourceFile, bindings };
}

const statementStub = { id: 'stmt' };
const referenceStub = { id: 'ref' };

function exportedBinding(name: string, declarationNode: TsMorphNode): BindingDescriptor {
    return {
        name,
        isExported: true,

        statement: statementStub as unknown as Statement,
        declarationNode,

        referenceNode: referenceStub as unknown as TsMorphNode
    };
}

test('gatherLocalSeeds adds entry-point exported bindings to the seed set', () => {
    const sourceFile = sourceFileFor('export const foo = 1;');
    const declaration = sourceFile.getVariableDeclarationOrThrow('foo');
    const binding = exportedBinding('foo', declaration);
    const file = fileBindings('/index.ts', sourceFile, [binding]);

    const seeds = gatherLocalSeeds([file], new Set(['/index.ts']), buildDeclarationNodeIndex([file]), undefined);

    assert.strictEqual(seeds.has('/index.ts::foo'), true);
});

test('gatherLocalSeeds ignores exported bindings of non-entry-point files', () => {
    const sourceFile = sourceFileFor('export const foo = 1;');
    const declaration = sourceFile.getVariableDeclarationOrThrow('foo');
    const binding = exportedBinding('foo', declaration);
    const file = fileBindings('/lib.ts', sourceFile, [binding]);

    const seeds = gatherLocalSeeds([file], new Set(['/index.ts']), buildDeclarationNodeIndex([file]), undefined);

    assert.strictEqual(seeds.has('/lib.ts::foo'), false);
});

test('gatherLocalSeeds returns an empty set when the bundle has no impure statements and no entry exports', () => {
    const sourceFile = sourceFileFor('const foo = 1;');
    const declaration = sourceFile.getVariableDeclarationOrThrow('foo');
    const binding: BindingDescriptor = {
        name: 'foo',
        isExported: false,

        statement: statementStub as unknown as Statement,
        declarationNode: declaration,

        referenceNode: referenceStub as unknown as TsMorphNode
    };
    const file = fileBindings('/index.ts', sourceFile, [binding]);

    const seeds = gatherLocalSeeds([file], new Set<string>(), buildDeclarationNodeIndex([file]), undefined);

    assert.deepStrictEqual(seeds, new Set<string>());
});
