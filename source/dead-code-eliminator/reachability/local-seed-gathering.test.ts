import assert from 'node:assert';
import type { Node as TsMorphNode, SourceFile, Statement } from 'ts-morph';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import type { BindingDescriptor } from './binding-extractor.ts';
import { buildDeclarationNodeIndex } from './binding-id.ts';
import { gatherLocalSeeds, type FileBindings } from './local-seed-gathering.ts';

type LocalSeedScenario = {
    readonly content: string;
    readonly entryPointPaths: ReadonlySet<string>;
    readonly isExported: boolean;
    readonly sourceFilePath: string;
};

function sourceFileFor(content: string): SourceFile {
    const project = createProject({ withFiles: [ { filePath: 'index.ts', content } ] });
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

function bindingDescriptor(
    name: string,
    declarationNode: TsMorphNode,
    isExported: boolean
): BindingDescriptor {
    return {
        name,
        isExported,

        statement: statementStub as unknown as Statement,
        declarationNode,

        referenceNode: referenceStub as unknown as TsMorphNode
    };
}

function gatherSeedsForSingleFooBinding(scenario: LocalSeedScenario): Set<string> {
    const sourceFile = sourceFileFor(scenario.content);
    const declaration = sourceFile.getVariableDeclarationOrThrow('foo');
    const binding = bindingDescriptor('foo', declaration, scenario.isExported);
    const file = fileBindings(scenario.sourceFilePath, sourceFile, [ binding ]);

    return gatherLocalSeeds(
        [ file ],
        scenario.entryPointPaths,
        buildDeclarationNodeIndex([ file ]),
        undefined
    );
}

suite('local-seed-gathering', function () {
    test('gatherLocalSeeds adds entry-point exported bindings to the seed set', function () {
        const seeds = gatherSeedsForSingleFooBinding({
            content: 'export const foo = 1;',
            entryPointPaths: new Set([ '/index.ts' ]),
            isExported: true,
            sourceFilePath: '/index.ts'
        });

        assert.strictEqual(seeds.has('/index.ts::foo'), true);
    });

    test('gatherLocalSeeds ignores exported bindings of non-entry-point files', function () {
        const seeds = gatherSeedsForSingleFooBinding({
            content: 'export const foo = 1;',
            entryPointPaths: new Set([ '/index.ts' ]),
            isExported: true,
            sourceFilePath: '/lib.ts'
        });

        assert.strictEqual(seeds.has('/lib.ts::foo'), false);
    });

    test('gatherLocalSeeds ignores unexported bindings of entry-point files', function () {
        const seeds = gatherSeedsForSingleFooBinding({
            content: 'const foo = 1;',
            entryPointPaths: new Set([ '/index.ts' ]),
            isExported: false,
            sourceFilePath: '/index.ts'
        });

        assert.deepStrictEqual(seeds, new Set<string>());
    });

    test('gatherLocalSeeds returns an empty set when the bundle has no impure statements and no entry exports', function () {
        const seeds = gatherSeedsForSingleFooBinding({
            content: 'const foo = 1;',
            entryPointPaths: new Set<string>(),
            isExported: false,
            sourceFilePath: '/index.ts'
        });

        assert.deepStrictEqual(seeds, new Set<string>());
    });
});
