import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Maybe } from 'true-myth';
import { createDependencyGraph, type DependencyGraph } from '../dependency-scanner/dependency-graph.ts';
import { createFakeFileManager } from '../test-libraries/fake-file-manager.ts';
import type { ResolvedBundle } from './resolved-bundle.ts';
import { createResourceResolver, type ResourceResolver } from './resource-resolver.ts';

type ExpectedReference = {
    readonly sourceSpecifier: string;
    readonly emittedSpecifier: string;
};

function unexpectedGraphMutation(): never {
    throw new Error('unexpected dependency graph mutation');
}

function resolverForGraph(graph: DependencyGraph): ResourceResolver {
    return createResourceResolver({
        dependencyScanner: {
            scan: fake.resolves(graph),
            scanEntries: fake.resolves(createDependencyGraph())
        },
        fileManager: createFakeFileManager({
            transferableFileDescriptionResponder(inputFilePath, targetFilePath) {
                return {
                    value: {
                        inputFilePath,
                        targetFilePath,
                        content: '',
                        isExecutable: false
                    }
                };
            }
        })
    });
}

function expectedNestedIndexDependency(references: readonly ExpectedReference[]): unknown {
    return {
        name: 'dep',
        referencedFrom: [ 'nested/index.js' ],
        references: references.map(function (reference) {
            return {
                targetFilePath: 'nested/index.js',
                sourceSpecifier: reference.sourceSpecifier,
                emittedSpecifier: reference.emittedSpecifier
            };
        })
    };
}

async function resolvePackageA(resolver: ResourceResolver): Promise<ResolvedBundle> {
    return await resolver.resolve({
        name: 'package-a',
        sourcesFolder: '/src',
        roots: { main: { js: '/src/nested/index.js' } },
        includeSourceMapFiles: false,
        additionalFiles: [],
        mainPackageJson: { type: 'module' }
    });
}

suite('resource-resolver external dependencies', function () {
    test('resolve() rewrites legacy external dependency references to target paths', async function () {
        const graph: DependencyGraph = {
            addDependency: unexpectedGraphMutation,
            connect: unexpectedGraphMutation,
            hasConnection: unexpectedGraphMutation,
            walk: unexpectedGraphMutation,
            isKnown: unexpectedGraphMutation,
            flatten() {
                return {
                    localFiles: [
                        {
                            filePath: '/src/nested/index.js',
                            directDependencies: new Set<string>(),
                            moduleReferences: []
                        }
                    ],
                    externalDependencies: new Map([
                        [
                            'dep',
                            {
                                name: 'dep',
                                referencedFrom: [ '/src/nested/index.js' ]
                            }
                        ]
                    ])
                };
            }
        };
        const resolver = resolverForGraph(graph);

        const result = await resolvePackageA(resolver);

        assert.deepStrictEqual(
            result.externalDependencies.get('dep'),
            expectedNestedIndexDependency([ { sourceSpecifier: 'dep', emittedSpecifier: 'dep' } ])
        );
    });

    test('resolve() rewrites external dependency references to target paths', async function () {
        const graph = createDependencyGraph();
        graph.addDependency('/src/nested/index.js', {
            sourceMapFilePath: Maybe.nothing(),
            externalDependencies: [
                { name: 'dep', sourceSpecifier: 'dep/source', emittedSpecifier: 'dep' },
                { name: 'dep', sourceSpecifier: 'dep/other-source', emittedSpecifier: 'dep/other' }
            ],
            moduleReferences: []
        });
        const resolver = resolverForGraph(graph);

        const result = await resolvePackageA(resolver);

        assert.deepStrictEqual(
            result.externalDependencies.get('dep'),
            expectedNestedIndexDependency([
                { sourceSpecifier: 'dep/source', emittedSpecifier: 'dep' },
                { sourceSpecifier: 'dep/other-source', emittedSpecifier: 'dep/other' }
            ])
        );
    });
});
