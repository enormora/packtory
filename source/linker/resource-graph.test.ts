import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { TransferableFileDescription } from '../file-manager/file-description.ts';
import { createGraphFromResolvedBundle } from './resource-graph.ts';

function createFileDescription(sourceFilePath: string, content: string): TransferableFileDescription {
    const targetFilePath = sourceFilePath.slice(1);

    return {
        sourceFilePath,
        targetFilePath,
        content,
        isExecutable: false
    };
}

const entryDescription = createFileDescription('/entry.js', '');

suite('resource-graph', function () {
    test('createGraphFromResolvedBundle() keeps only external dependencies referenced by each resource', function () {
        const root = {
            js: entryDescription
        } as const;
        const graph = createGraphFromResolvedBundle({
            name: 'package-a',
            contents: [
                {
                    fileDescription: entryDescription,
                    directDependencies: new Set([ '/other.js' ]),
                    isExplicitlyIncluded: false
                },
                {
                    fileDescription: createFileDescription('/other.js', ''),
                    directDependencies: new Set(),
                    isExplicitlyIncluded: false
                }
            ],
            roots: { main: root },
            surface: { mode: 'implicit', defaultModuleRoot: 'main' } as const,
            externalDependencies: new Map([
                [ 'left-pad', { name: 'left-pad', referencedFrom: [ '/entry.js' ] as const } ],
                [ 'unused', { name: 'unused', referencedFrom: [ '/not-used.js' ] as const } ]
            ])
        });
        const visited: { readonly id: string; readonly externalDependencies: readonly string[]; }[] = [];

        graph.visitBreadthFirstSearch('/entry.js', function (node) {
            visited.push({ id: node.id, externalDependencies: node.data.externalDependencies });
        });

        assert.deepStrictEqual(visited, [
            { id: '/entry.js', externalDependencies: [ 'left-pad' ] },
            { id: '/other.js', externalDependencies: [] }
        ]);
    });

    test('createGraphFromResolvedBundle() preserves the generated-manifest marker on resources', function () {
        const root = {
            js: entryDescription
        } as const;
        const graph = createGraphFromResolvedBundle({
            name: 'package-a',
            contents: [
                {
                    fileDescription: entryDescription,
                    directDependencies: new Set([ '/package.json' ]),
                    isExplicitlyIncluded: false
                },
                {
                    fileDescription: createFileDescription('/package.json', '{}'),
                    directDependencies: new Set(),
                    isExplicitlyIncluded: false,
                    isGeneratedManifest: true
                }
            ],
            roots: { main: root },
            surface: { mode: 'implicit', defaultModuleRoot: 'main' } as const,
            externalDependencies: new Map()
        });
        const manifestNodeData: { readonly isGeneratedManifest?: true | undefined; }[] = [];

        graph.visitBreadthFirstSearch('/entry.js', function (node) {
            if (node.id === '/package.json') {
                manifestNodeData.push(node.data);
            }
        });

        assert.deepStrictEqual(manifestNodeData, [
            {
                fileDescription: {
                    content: '{}',
                    isExecutable: false,
                    sourceFilePath: '/package.json',
                    targetFilePath: 'package.json'
                },
                externalDependencies: [],
                isExplicitlyIncluded: false,
                isGeneratedManifest: true,
                project: undefined
            }
        ]);
    });
});
