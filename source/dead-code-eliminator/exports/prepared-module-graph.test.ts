import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { SourceFile } from 'ts-morph';
import type { ArtifactModuleReference } from '../../resource-resolver/resolved-bundle.ts';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createPreparedModuleGraph, type PreparedModuleGraph } from './prepared-module-graph.ts';

type ModuleGraphFixture = {
    readonly graph: PreparedModuleGraph;
    readonly entry: SourceFile;
    readonly target: SourceFile;
    readonly unregistered: SourceFile;
};

function graphWithReferences(references: readonly ArtifactModuleReference[]): ModuleGraphFixture {
    const project = createProject();
    const entry = project.createSourceFile('/physical/index.js', 'export {value} from "./nearby.js";');
    const target = project.createSourceFile('/elsewhere/value.js', 'export const value=42;');
    const unregistered = project.createSourceFile('/physical/nearby.js', 'export const value=0;');
    return {
        entry,
        target,
        unregistered,
        graph: createPreparedModuleGraph([
            { sourceFile: entry, targetFilePath: 'output/index.js', moduleReferences: references },
            { sourceFile: target, targetFilePath: 'output/value.js', moduleReferences: [] }
        ])
    };
}

suite('prepared module graph', function () {
    test('resolves emitted specifiers to recorded targets rather than nearby physical sources', function () {
        const { graph, entry, target } = graphWithReferences([ {
            type: 'local-code',
            sourceSpecifier: '../authored/value.ts',
            emittedSpecifier: './nearby.js',
            targetFilePath: 'output/value.js'
        } ]);
        assert.strictEqual(graph.resolveModule(entry, './nearby.js'), target);
        assert.strictEqual(graph.resolveModule(entry, '../authored/value.ts'), undefined);
        assert.strictEqual(
            graph.index.binding(entry, 'value')?.declarationNode,
            target.getVariableDeclaration('value')
        );
    });

    test('does not resolve unrecorded imports from physical project files', function () {
        const { graph, entry } = graphWithReferences([]);
        assert.strictEqual(graph.resolveModule(entry, './nearby.js'), undefined);
        assert.strictEqual(graph.index.status(entry, 'value'), 'unknown');
    });

    test('does not borrow another module’s references for an unregistered source', function () {
        const { graph, unregistered } = graphWithReferences([ {
            type: 'local-code',
            sourceSpecifier: './nearby.js',
            emittedSpecifier: './nearby.js',
            targetFilePath: 'output/value.js'
        } ]);
        assert.strictEqual(graph.resolveModule(unregistered, './nearby.js'), undefined);
    });

    test('keeps missing recorded targets unresolved', function () {
        const { graph, entry } = graphWithReferences([ {
            type: 'local-code',
            sourceSpecifier: './nearby.js',
            emittedSpecifier: './nearby.js',
            targetFilePath: 'output/missing.js'
        } ]);
        assert.strictEqual(graph.resolveModule(entry, './nearby.js'), undefined);
    });

    for (const type of [ 'local-asset', 'generated-manifest', 'linked-code' ] as const) {
        test(`keeps ${type} references outside the local code graph`, function () {
            const { graph, entry } = graphWithReferences([ {
                type,
                sourceSpecifier: './nearby.js',
                emittedSpecifier: './nearby.js',
                targetFilePath: 'output/value.js',
                packageName: 'dependency'
            } ]);
            assert.strictEqual(graph.resolveModule(entry, './nearby.js'), undefined);
        });
    }

    test('leaves external package references to the external resolver', function () {
        const { graph, entry } = graphWithReferences([ {
            type: 'external-package',
            sourceSpecifier: 'dependency',
            emittedSpecifier: './nearby.js',
            packageName: 'dependency'
        } ]);
        assert.strictEqual(graph.resolveModule(entry, './nearby.js'), undefined);
    });
});
