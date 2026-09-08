import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../test-libraries/typescript-project.ts';
import type { ArtifactModuleReference, ResolvedBundle } from '../resource-resolver/resolved-bundle.ts';
import {
    analyzedBundleResource,
    bundleResource,
    versionedBundleWithManifest
} from '../test-libraries/bundle-fixtures.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import { createGraphFromResolvedBundle, type ResourceGraph } from './resource-graph.ts';
import { substituteDependencies } from './substitute-bundles.ts';

function bundleSource(packageName: string, inputFilePath: string): VersionedBundleWithManifest {
    const targetFilePath = inputFilePath.replace(/^\//u, '');
    const mainFile = { content: '', isExecutable: false, inputFilePath, targetFilePath };
    return versionedBundleWithManifest({
        contents: [
            analyzedBundleResource(inputFilePath, { targetFilePath })
        ],
        exportsField: { '.': { import: `./${targetFilePath}` } },
        mainFile,
        manifestFile: { content: '', isExecutable: false, filePath: '/package.json' },
        name: packageName,
        packageJson: { name: packageName, version: '21' },
        roots: { main: { js: mainFile } },
        surface: { mode: 'implicit', defaultModuleRoot: 'main' },
        version: '21'
    });
}

function unexpectedGraphCall(): never {
    throw new Error('unexpected graph call');
}

function graphWithEntry(
    content: string,
    directDependencies: ReadonlySet<string>,
    moduleReferences: readonly ArtifactModuleReference[],
    extraContents: ResolvedBundle['contents']
): ResourceGraph {
    const project = createProject({ withFiles: [ { filePath: '/entry.js', content } ] });
    return createGraphFromResolvedBundle({
        contents: [
            {
                ...bundleResource('/entry.js', { content, directDependencies, moduleReferences }),
                project
            },
            ...extraContents
        ],
        roots: {
            main: {
                js: { content: '', isExecutable: false, inputFilePath: '/entry.js', targetFilePath: 'entry.js' }
            }
        },
        surface: { mode: 'implicit', defaultModuleRoot: 'main' },
        externalDependencies: new Map(),
        name: 'test-bundle'
    });
}

function localAssetReference(targetFilePath: string): ArtifactModuleReference {
    return {
        type: 'local-asset',
        sourceSpecifier: './data.json',
        emittedSpecifier: './data.json',
        targetFilePath
    };
}

function linkedCodeReference(
    sourceSpecifier: string,
    emittedSpecifier: string,
    packageName: string,
    targetFilePath: string
): ArtifactModuleReference {
    return { type: 'linked-code', sourceSpecifier, emittedSpecifier, packageName, targetFilePath };
}

suite('substitute-bundles module references', function () {
    test('rewrites local asset module references when substituted', function () {
        const inputGraph = graphWithEntry(
            'import data from "./data.json";',
            new Set([ 'data.json' ]),
            [
                localAssetReference('data.json'),
                {
                    type: 'external-package',
                    sourceSpecifier: 'dep',
                    emittedSpecifier: 'dep',
                    packageName: 'dep',
                    targetFilePath: 'data.json'
                } as unknown as ArtifactModuleReference
            ],
            [
                bundleResource('/data.json', { content: '{"ok":true}', targetFilePath: 'data.json' })
            ]
        );

        const substitutedGraph = substituteDependencies(inputGraph, [ bundleSource('data-package', '/data.json') ], []);
        const result = substitutedGraph.flatten([ '/entry.js' ]);

        assert.deepStrictEqual(result.contents[0]?.moduleReferences, [
            linkedCodeReference('./data.json', 'data-package', 'data-package', 'data.json'),
            {
                type: 'external-package',
                sourceSpecifier: 'dep',
                emittedSpecifier: 'dep',
                packageName: 'dep',
                targetFilePath: 'data.json'
            }
        ]);
    });

    test('leaves local module references unchanged when no replacement input path exists', function () {
        const inputGraph = graphWithEntry(
            'import data from "./data.json";',
            new Set<string>(),
            [
                localAssetReference('missing.json')
            ],
            []
        );

        const substitutedGraph = substituteDependencies(inputGraph, [ bundleSource('data-package', '/data.json') ], []);
        const result = substitutedGraph.flatten([ '/entry.js' ]);

        assert.deepStrictEqual(result.contents[0]?.moduleReferences, [
            localAssetReference('missing.json')
        ]);
    });

    test('rewrites generated manifest module references when substituted', function () {
        const inputGraph = graphWithEntry(
            'import manifest from "./package.json";',
            new Set([ 'package.json' ]),
            [
                {
                    type: 'generated-manifest',
                    sourceSpecifier: './package.json',
                    emittedSpecifier: './package.json',
                    targetFilePath: 'package.json'
                }
            ],
            [
                {
                    ...bundleResource('/package.json', {
                        content: '{"name":"fixture"}',
                        targetFilePath: 'package.json'
                    }),
                    isGeneratedManifest: true
                }
            ]
        );

        const substitutedGraph = substituteDependencies(inputGraph, [
            bundleSource('manifest-package', '/package.json')
        ], []);
        const result = substitutedGraph.flatten([ '/entry.js' ]);

        assert.deepStrictEqual(result.contents[0]?.moduleReferences, [
            linkedCodeReference('./package.json', 'manifest-package', 'manifest-package', 'package.json')
        ]);
    });

    test('substitutes each traversed node once', function () {
        const resource = bundleResource('/entry.js', { content: 'export const api = 1;', targetFilePath: 'entry.js' });
        const inputGraph: ResourceGraph = {
            inputFilePathByTargetFilePath: new Map([ [ 'entry.js', '/entry.js' ] ]),
            targetFilePathByInputFilePath: new Map([ [ '/entry.js', 'entry.js' ] ]),
            addNode: unexpectedGraphCall,
            connect: unexpectedGraphCall,
            disconnect: unexpectedGraphCall,
            hasNode: unexpectedGraphCall,
            hasConnection: unexpectedGraphCall,
            visitBreadthFirstSearch: unexpectedGraphCall,
            detectCycles: unexpectedGraphCall,
            isCyclic: unexpectedGraphCall,
            getTopologicalGenerations: unexpectedGraphCall,
            reverse: unexpectedGraphCall,
            getAdjacentIds: unexpectedGraphCall,
            traverse(visitor) {
                const node = {
                    id: '/entry.js',
                    data: {
                        fileDescription: resource.fileDescription,
                        moduleReferences: resource.moduleReferences,
                        externalDependencies: [],
                        isExplicitlyIncluded: false
                    },
                    adjacentNodeIds: new Set<string>(),
                    incomingEdges: 0
                };
                visitor(node);
                visitor(node);
            }
        };

        const substitutedGraph = substituteDependencies(inputGraph, [], []);
        const result = substitutedGraph.flatten([ '/entry.js' ]);

        assert.strictEqual(result.contents.length, 1);
    });
});
