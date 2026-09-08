import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { TransferableFileDescription } from '../file-manager/file-description.ts';
import { createGraphFromResolvedBundle } from './resource-graph.ts';

function createFileDescription(inputFilePath: string, content: string): TransferableFileDescription {
    const targetFilePath = inputFilePath.slice(1);

    return {
        inputFilePath,
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
                    directDependencies: new Set([ 'other.js' ]),
                    moduleReferences: [],
                    isExplicitlyIncluded: false
                },
                {
                    fileDescription: createFileDescription('/other.js', ''),
                    directDependencies: new Set(),
                    moduleReferences: [],
                    isExplicitlyIncluded: false
                }
            ],
            roots: { main: root },
            surface: { mode: 'implicit', defaultModuleRoot: 'main' } as const,
            externalDependencies: new Map([
                [ 'left-pad', { name: 'left-pad', referencedFrom: [ 'entry.js' ] as const } ],
                [
                    'referenced',
                    {
                        name: 'referenced',
                        referencedFrom: [ '/entry.js', '/other.js' ],
                        references: [
                            {
                                targetFilePath: 'entry.js',
                                sourceSpecifier: 'referenced/source',
                                emittedSpecifier: 'referenced'
                            },
                            {
                                targetFilePath: 'other.js',
                                sourceSpecifier: 'referenced/other',
                                emittedSpecifier: 'referenced'
                            }
                        ]
                    }
                ],
                [
                    'stale-reference',
                    {
                        name: 'stale-reference',
                        referencedFrom: [ 'entry.js' ],
                        references: [
                            {
                                targetFilePath: 'not-entry.js',
                                sourceSpecifier: 'stale-reference/not-entry',
                                emittedSpecifier: 'stale-reference'
                            }
                        ]
                    }
                ],
                [ 'unused', { name: 'unused', referencedFrom: [ 'not-used.js' ] as const } ]
            ])
        });
        const visited: {
            readonly id: string;
            readonly externalDependencies: readonly { readonly name: string; }[];
        }[] = [];

        graph.visitBreadthFirstSearch('/entry.js', function (node) {
            visited.push({ id: node.id, externalDependencies: node.data.externalDependencies });
        });

        assert.deepStrictEqual(visited, [
            {
                id: '/entry.js',
                externalDependencies: [
                    { name: 'left-pad', sourceSpecifier: 'left-pad', emittedSpecifier: 'left-pad' },
                    { name: 'referenced', sourceSpecifier: 'referenced/source', emittedSpecifier: 'referenced' }
                ]
            },
            {
                id: '/other.js',
                externalDependencies: [
                    { name: 'referenced', sourceSpecifier: 'referenced/other', emittedSpecifier: 'referenced' }
                ]
            }
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
                    directDependencies: new Set([ 'package.json' ]),
                    moduleReferences: [],
                    isExplicitlyIncluded: false
                },
                {
                    fileDescription: createFileDescription('/package.json', '{}'),
                    directDependencies: new Set(),
                    moduleReferences: [],
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
                    inputFilePath: '/package.json',
                    targetFilePath: 'package.json'
                },
                externalDependencies: [],
                isExplicitlyIncluded: false,
                isGeneratedManifest: true,
                moduleReferences: [],
                project: undefined
            }
        ]);
    });
});
