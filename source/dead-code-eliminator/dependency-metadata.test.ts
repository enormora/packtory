import assert from 'node:assert';
import { suite, test } from 'mocha';
import { identity } from 'remeda';
import type { ExternalDependency } from '../dependency-scanner/external-dependencies.ts';
import type { ArtifactModuleReference } from '../resource-resolver/resolved-bundle.ts';
import { analyzedBundleResource, linkedBundle } from '../test-libraries/bundle-fixtures.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import { indexSourceFiles, recomputeDependencyMetadata, type SourceFileByPath } from './dependency-metadata.ts';
import { loadBundle } from './load-bundle.ts';
import type { AnalyzedBundleResource } from './analyzed-bundle.ts';

const emptyDependencyMetadata = {
    externalDependencies: new Map<string, ExternalDependency>(),
    linkedBundleDependencies: new Map<string, ExternalDependency>(),
    substitutedInputFilePathsByPackageName: new Map<string, ReadonlySet<string>>()
};

function sourceFileIndex(resources: readonly AnalyzedBundleResource[]): SourceFileByPath {
    const project = createProject({
        withFiles: resources.map(function ({ fileDescription }) {
            return { filePath: fileDescription.inputFilePath, content: fileDescription.content };
        })
    });
    return new Map(resources.map(function ({ fileDescription }) {
        return [ fileDescription.targetFilePath, project.getSourceFileOrThrow(fileDescription.inputFilePath) ];
    }));
}

function recomputePackageDependency(
    dependency: ExternalDependency,
    resources: readonly AnalyzedBundleResource[]
): ExternalDependency | undefined {
    return recomputeDependencyMetadata(
        { ...emptyDependencyMetadata, externalDependencies: new Map([ [ dependency.name, dependency ] ]) },
        resources,
        sourceFileIndex(resources),
        identity()
    )
        .externalDependencies
        .get(dependency.name);
}

function dependencyWithReferences(
    name: string,
    references: ExternalDependency['references']
): ExternalDependency {
    assert.notStrictEqual(references, undefined);
    return { name, referencedFrom: [ 'index.js' ], references };
}

suite('dependency metadata', function () {
    test('retains dependency references only from selected resources after recomputing local edges', function () {
        const resources = [ 'index.js', 'unused.js', 'unused.d.ts' ].map(function (targetFilePath) {
            return analyzedBundleResource(`/source/${targetFilePath}`, {
                targetFilePath,
                content: 'import "dep";',
                directDependencies: new Set([ 'unused-target.js' ])
            });
        });
        const dependency: ExternalDependency = {
            name: 'dep',
            referencedFrom: [ 'index.js', 'unused.js', 'unused.d.ts' ],
            references: [
                { targetFilePath: 'index.js', sourceSpecifier: 'dep', emittedSpecifier: 'dep' },
                { targetFilePath: 'unused.js', sourceSpecifier: 'dep', emittedSpecifier: 'dep' },
                { targetFilePath: 'unused.d.ts', sourceSpecifier: 'dep', emittedSpecifier: 'dep' }
            ]
        };
        const result = recomputeDependencyMetadata(
            { ...emptyDependencyMetadata, externalDependencies: new Map([ [ 'dep', dependency ] ]) },
            resources,
            sourceFileIndex(resources),
            function (candidates) {
                return candidates.filter(function (resource) {
                    return resource.fileDescription.targetFilePath === 'index.js' &&
                        resource.directDependencies.size === 0;
                });
            }
        );
        assert.deepStrictEqual(
            result.contents.map(function (resource) {
                return resource.fileDescription.targetFilePath;
            }),
            [ 'index.js' ]
        );
        assert.deepStrictEqual(result.externalDependencies.get('dep'), {
            name: 'dep',
            referencedFrom: [ 'index.js' ],
            references: [ { targetFilePath: 'index.js', sourceSpecifier: 'dep', emittedSpecifier: 'dep' } ]
        });
    });

    test('recomputeDependencyMetadata preserves dependencies belonging to non-code resources', function () {
        const resource = analyzedBundleResource('/source/settings.json', {
            targetFilePath: 'settings.json',
            content: '{"extends":"./defaults.json"}',
            directDependencies: new Set([ 'defaults.json' ])
        });
        const result = recomputeDependencyMetadata(
            emptyDependencyMetadata,
            [ resource ],
            new Map(),
            identity()
        );

        assert.deepStrictEqual(result.contents, [ resource ]);
    });

    test('recomputeDependencyMetadata keeps surviving local reference types as direct dependencies', function () {
        const content = [
            'import "./live.js";',
            'import "./data.json";',
            'import "./package.json";',
            'import "dep";',
            'export const api = 1;'
        ]
            .join('\n');
        const resource = analyzedBundleResource('/source/index.js', {
            content,
            targetFilePath: 'index.js',
            directDependencies: new Set([
                'live.js',
                'data.json',
                'package.json',
                'index.js.map',
                'dependency-target',
                'Stryker was here'
            ]),
            moduleReferences: [
                {
                    type: 'local-code',
                    sourceSpecifier: './live.js',
                    emittedSpecifier: './live.js',
                    targetFilePath: 'live.js'
                },
                {
                    type: 'local-asset',
                    sourceSpecifier: './data.json',
                    emittedSpecifier: './data.json',
                    targetFilePath: 'data.json'
                },
                {
                    type: 'generated-manifest',
                    sourceSpecifier: './package.json',
                    emittedSpecifier: './package.json',
                    targetFilePath: 'package.json'
                },
                {
                    type: 'external-package',
                    packageName: 'dep',
                    sourceSpecifier: 'dep',
                    emittedSpecifier: 'dep',
                    targetFilePath: 'dependency-target'
                } as unknown as ArtifactModuleReference
            ]
        });

        const result = recomputeDependencyMetadata(
            emptyDependencyMetadata,
            [ resource ],
            sourceFileIndex([ resource ]),
            identity()
        );

        assert.deepStrictEqual(
            result.contents[0]?.directDependencies,
            new Set([ 'live.js', 'data.json', 'package.json', 'index.js.map' ])
        );
    });

    test('recomputeDependencyMetadata preserves only surviving package references', function () {
        const content = [
            'import live from "dep/live";',
            'import other from "dep/other";',
            'import linked from "linked/entry";',
            'import "./local.js";',
            'export { live, other, linked };'
        ]
            .join('\n');
        const references: NonNullable<ExternalDependency['references']> = [
            { targetFilePath: 'index.js', sourceSpecifier: 'live-source', emittedSpecifier: 'dep/live' },
            { targetFilePath: 'index.js', sourceSpecifier: 'other-source', emittedSpecifier: 'dep/other' },
            { targetFilePath: 'index.js', sourceSpecifier: 'removed-source', emittedSpecifier: 'dep/removed' },
            { targetFilePath: 'index.js', sourceSpecifier: 'local-source', emittedSpecifier: './local.js' },
            { targetFilePath: 'index.js', sourceSpecifier: 'dead-source', emittedSpecifier: 'Stryker was here' }
        ];
        const resource = analyzedBundleResource('/source/index.js', {
            content,
            targetFilePath: 'index.js',
            moduleReferences: [
                {
                    type: 'local-code',
                    sourceSpecifier: './local.js',
                    emittedSpecifier: './local.js',
                    targetFilePath: 'local.js'
                },
                {
                    type: 'external-package',
                    packageName: 'dep',
                    sourceSpecifier: 'dep/live',
                    emittedSpecifier: 'dep/live'
                },
                {
                    type: 'external-package',
                    packageName: 'dep',
                    sourceSpecifier: 'dep/other',
                    emittedSpecifier: 'dep/other'
                },
                {
                    type: 'external-package',
                    packageName: 'dep',
                    sourceSpecifier: 'dep/removed',
                    emittedSpecifier: 'dep/removed'
                },
                {
                    type: 'linked-code',
                    packageName: 'linked',
                    sourceSpecifier: 'linked/entry',
                    emittedSpecifier: 'linked/entry',
                    targetFilePath: 'linked.js'
                }
            ]
        });

        const result = recomputeDependencyMetadata(
            {
                externalDependencies: new Map([
                    [ 'dep', dependencyWithReferences('dep', references) ],
                    [
                        undefined as unknown as string,
                        dependencyWithReferences(undefined as unknown as string, [
                            {
                                targetFilePath: 'index.js',
                                sourceSpecifier: 'local-source',
                                emittedSpecifier: './local.js'
                            }
                        ])
                    ]
                ]),
                linkedBundleDependencies: new Map([
                    [
                        'linked',
                        dependencyWithReferences('linked', [
                            {
                                targetFilePath: 'index.js',
                                sourceSpecifier: 'linked-source',
                                emittedSpecifier: 'linked/entry'
                            }
                        ])
                    ],
                    [
                        'removed-linked',
                        dependencyWithReferences('removed-linked', [
                            {
                                targetFilePath: 'index.js',
                                sourceSpecifier: 'removed-linked',
                                emittedSpecifier: 'removed-linked'
                            }
                        ])
                    ]
                ]),
                substitutedInputFilePathsByPackageName: new Map([
                    [ 'linked', new Set([ '/linked/index.js' ]) ],
                    [ 'removed-linked', new Set([ '/linked/removed.js' ]) ]
                ])
            },
            [ resource ],
            sourceFileIndex([ resource ]),
            identity()
        );

        assert.deepStrictEqual(result.externalDependencies.get('dep')?.references, references.slice(0, 2));
        assert.strictEqual(result.externalDependencies.has(undefined as unknown as string), false);
        assert.deepStrictEqual(result.linkedBundleDependencies.get('linked')?.references, [
            { targetFilePath: 'index.js', sourceSpecifier: 'linked-source', emittedSpecifier: 'linked/entry' }
        ]);
        assert.deepStrictEqual(Array.from(result.substitutedInputFilePathsByPackageName.keys()), [ 'linked' ]);
    });

    test('recomputeDependencyMetadata keeps distinct reference fields and merges duplicates in encounter order', function () {
        const index = analyzedBundleResource('/source/index.js', { content: 'import "dep/live"; import "dep/other";' });
        const other = analyzedBundleResource('/source/other.js', { content: 'import "dep/live";' });
        const references: NonNullable<ExternalDependency['references']> = [
            { targetFilePath: 'index.js', sourceSpecifier: 'alias/live', emittedSpecifier: 'dep/live' },
            { targetFilePath: 'index.js', sourceSpecifier: 'alias/other', emittedSpecifier: 'dep/live' },
            { targetFilePath: 'index.js', sourceSpecifier: 'alias/live', emittedSpecifier: 'dep/other' },
            { targetFilePath: 'other.js', sourceSpecifier: 'alias/live', emittedSpecifier: 'dep/live' }
        ];
        const dependency = dependencyWithReferences('dep', [ ...references, references[0] ]);
        const result = recomputePackageDependency(dependency, [ index, other ]);

        assert.deepStrictEqual(result, {
            name: 'dep',
            referencedFrom: [ 'index.js', 'other.js' ],
            references
        });
    });

    test('recomputeDependencyMetadata resolves legacy package references across multiple files', function () {
        const index = analyzedBundleResource('/source/index.js', { content: 'import "dep/live";' });
        const other = analyzedBundleResource('/source/other.js', { content: 'import "dep/other";' });
        const result = recomputePackageDependency({ name: 'dep', referencedFrom: [ 'index.js', 'other.js' ] }, [
            index,
            other
        ]);

        assert.deepStrictEqual(result, {
            name: 'dep',
            referencedFrom: [ 'index.js', 'other.js' ],
            references: [
                { targetFilePath: 'index.js', sourceSpecifier: 'dep', emittedSpecifier: 'dep' },
                { targetFilePath: 'other.js', sourceSpecifier: 'dep', emittedSpecifier: 'dep' }
            ]
        });
    });

    test('recomputeDependencyMetadata retains declaration references and removes missing resource references', function () {
        const declaration = analyzedBundleResource('/source/index.d.ts', {
            content: '/// <reference types="dep" />\nexport interface Api {}'
        });
        const dependency = dependencyWithReferences('dep', [
            { targetFilePath: 'index.d.ts', sourceSpecifier: 'dep', emittedSpecifier: 'dep' },
            { targetFilePath: 'missing.js', sourceSpecifier: 'dep', emittedSpecifier: 'dep' }
        ]);
        const result = recomputePackageDependency(dependency, [ declaration ]);

        assert.deepStrictEqual(result?.references, dependency.references?.slice(0, 1));
    });

    test('indexSourceFiles indexes every loaded source by its emitted path', function () {
        const index = analyzedBundleResource('/source/index.js', { content: 'export const first = 1;' });
        const other = analyzedBundleResource('/source/other.js', { content: 'export const second = 2;' });
        const loaded = loadBundle(createProject, {
            bundle: linkedBundle({
                roots: { main: { javaScript: index.fileDescription } },
                contents: [ index, other ]
            }),
            transformationsEnabled: false,
            substitutionPublicModuleInputFilePaths: new Set()
        }, undefined);
        const sources = indexSourceFiles(loaded);

        assert.deepStrictEqual(sources.keys().toArray(), [ 'index.js', 'other.js' ]);
        assert.strictEqual(sources.get('index.js')?.getFullText(), index.fileDescription.content);
        assert.strictEqual(sources.get('other.js')?.getFullText(), other.fileDescription.content);
    });
});
