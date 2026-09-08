import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { ExternalDependency } from '../dependency-scanner/external-dependencies.ts';
import type { ArtifactModuleReference } from '../resource-resolver/resolved-bundle.ts';
import { analyzedBundleResource } from '../test-libraries/bundle-fixtures.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import { recomputeDependencyMetadata, type SourceFileByPath } from './dependency-metadata.ts';

function sourceFileIndex(inputFilePath: string, targetFilePath: string, content: string): SourceFileByPath {
    const project = createProject({ withFiles: [ { filePath: inputFilePath, content } ] });
    return new Map([ [ targetFilePath, project.getSourceFileOrThrow(inputFilePath) ] ]);
}

function dependencyWithReferences(
    name: string,
    references: ExternalDependency['references']
): ExternalDependency {
    assert.notStrictEqual(references, undefined);
    return { name, referencedFrom: [ 'index.js' ], references };
}

suite('dependency metadata', function () {
    test('recomputeDependencyMetadata keeps surviving local reference types as direct dependencies', function () {
        const content = [
            'import "./live.js";',
            'import "./data.json";',
            'import "./package.json";',
            'import "dep";',
            'export const api = 1;'
        ]
            .join('\n');
        const resource = analyzedBundleResource('/src/index.js', {
            content,
            targetFilePath: 'index.js',
            directDependencies: new Set([ 'live.js', 'data.json', 'package.json', 'dep-target', 'Stryker was here' ]),
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
                    targetFilePath: 'dep-target'
                } as unknown as ArtifactModuleReference
            ]
        });

        const result = recomputeDependencyMetadata(
            {
                externalDependencies: new Map(),
                linkedBundleDependencies: new Map(),
                substitutedInputFilePathsByPackageName: new Map()
            },
            [ resource ],
            sourceFileIndex('/src/index.js', 'index.js', content)
        );

        assert.deepStrictEqual(
            result.contents[0]?.directDependencies,
            new Set([ 'live.js', 'data.json', 'package.json' ])
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
            { targetFilePath: 'index.js', sourceSpecifier: 'local-source', emittedSpecifier: './local.js' },
            { targetFilePath: 'index.js', sourceSpecifier: 'dead-source', emittedSpecifier: 'Stryker was here' }
        ];
        const resource = analyzedBundleResource('/src/index.js', {
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
                    ]
                ]),
                substitutedInputFilePathsByPackageName: new Map([ [ 'linked', new Set([ '/linked/index.js' ]) ] ])
            },
            [ resource ],
            sourceFileIndex('/src/index.js', 'index.js', content)
        );

        assert.deepStrictEqual(result.externalDependencies.get('dep')?.references, references.slice(0, 2));
        assert.strictEqual(result.externalDependencies.has(undefined as unknown as string), false);
        assert.deepStrictEqual(result.linkedBundleDependencies.get('linked')?.references, [
            { targetFilePath: 'index.js', sourceSpecifier: 'linked-source', emittedSpecifier: 'linked/entry' }
        ]);
        assert.deepStrictEqual(Array.from(result.substitutedInputFilePathsByPackageName.keys()), [ 'linked' ]);
    });
});
