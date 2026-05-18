import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createGraphFromResolvedBundle } from './resource-graph.ts';

suite('resource-graph', function () {
    test('createGraphFromResolvedBundle() keeps only external dependencies referenced by each resource', function () {
        const root = {
            js: {
                sourceFilePath: '/entry.js',
                targetFilePath: 'entry.js',
                content: '',
                isExecutable: false
            }
        } as const;
        const graph = createGraphFromResolvedBundle({
            name: 'package-a',
            contents: [
                {
                    fileDescription: {
                        sourceFilePath: '/entry.js',
                        targetFilePath: 'entry.js',
                        content: '',
                        isExecutable: false
                    },
                    directDependencies: new Set(['/other.js']),
                    isExplicitlyIncluded: false
                },
                {
                    fileDescription: {
                        sourceFilePath: '/other.js',
                        targetFilePath: 'other.js',
                        content: '',
                        isExecutable: false
                    },
                    directDependencies: new Set(),
                    isExplicitlyIncluded: false
                }
            ],
            roots: { main: root },
            surface: { mode: 'implicit', defaultModuleRoot: 'main' } as const,
            externalDependencies: new Map([
                ['left-pad', { name: 'left-pad', referencedFrom: ['/entry.js'] as const }],
                ['unused', { name: 'unused', referencedFrom: ['/not-used.js'] as const }]
            ])
        });
        const visited: { id: string; externalDependencies: readonly string[] }[] = [];

        graph.visitBreadthFirstSearch('/entry.js', (node) => {
            visited.push({ id: node.id, externalDependencies: node.data.externalDependencies });
        });

        assert.deepStrictEqual(visited, [
            { id: '/entry.js', externalDependencies: ['left-pad'] },
            { id: '/other.js', externalDependencies: [] }
        ]);
    });
});
