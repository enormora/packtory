import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { Project } from 'ts-morph';
import type { FileAnalysis } from '../dead-code-eliminator/analyzed-bundle.ts';
import { bundleResource, versionedBundleWithManifest } from '../test-libraries/bundle-fixtures.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import { createGraphFromResolvedBundle, type ResourceGraph } from './resource-graph.ts';
import { substituteDependencies } from './substitute-bundles.ts';

type ResolvedContentDescription = {
    readonly source: string;
    readonly content: string;
    readonly directDependencies?: readonly string[];
    readonly project?: Project;
    readonly isExplicitlyIncluded?: boolean;
    readonly isGeneratedManifest?: true;
    readonly targetFilePath?: string;
};

function buildInputGraph(
    contents: readonly ResolvedContentDescription[],
    entryPath = '/entry.js'
): ResourceGraph {
    const root = {
        js: { content: '', isExecutable: false, inputFilePath: entryPath, targetFilePath: 'entry.js' },
        declarationFile: undefined
    } as const;
    return createGraphFromResolvedBundle({
        contents: contents.map(function (entry) {
            return {
                ...bundleResource(entry.source, {
                    content: entry.content,
                    ...entry.targetFilePath === undefined ? {} : { targetFilePath: entry.targetFilePath },
                    directDependencies: new Set((entry.directDependencies ?? []).map(function (filePath) {
                        return filePath.replace(/^\//u, '');
                    })),
                    isExplicitlyIncluded: entry.isExplicitlyIncluded ?? false
                }),
                project: entry.project,
                ...entry.isGeneratedManifest === true ? { isGeneratedManifest: true } : {}
            };
        }),
        roots: { main: root },
        surface: { mode: 'implicit', defaultModuleRoot: 'main' },
        externalDependencies: new Map(),
        name: 'test-bundle'
    });
}

function emptySubstitutionAnalysis(): FileAnalysis {
    return {
        survivingBindings: new Set<string>(),
        sideEffectStatements: [],
        sideEffectImports: new Set<string>()
    };
}

function bundleSource(packageName: string, inputFilePath: string, isSubstituted = false): VersionedBundleWithManifest {
    const targetFilePath = inputFilePath.replace(/^\//u, '');
    return versionedBundleWithManifest({
        name: packageName,
        version: '21',
        roots: { main: { js: { content: '', isExecutable: false, inputFilePath, targetFilePath } } },
        surface: { mode: 'implicit', defaultModuleRoot: 'main' },
        contents: [
            {
                ...bundleResource(inputFilePath, { targetFilePath }),
                isSubstituted,
                analysis: emptySubstitutionAnalysis()
            }
        ],
        packageJson: { name: packageName, version: '21' },
        exportsField: { '.': { import: `./${targetFilePath}` } },
        mainFile: { content: '', isExecutable: false, inputFilePath: '/bar.js', targetFilePath: 'bar.js' },
        manifestFile: { content: '', isExecutable: false, filePath: '/bar.js' }
    });
}

function bundleSourceWithExtraFile(packageName: string): VersionedBundleWithManifest {
    return versionedBundleWithManifest({
        name: packageName,
        version: '21',
        roots: {
            main: {
                js: { content: '', isExecutable: false, inputFilePath: '/foo.js', targetFilePath: 'foo.js' }
            }
        },
        surface: { mode: 'implicit', defaultModuleRoot: 'main' },
        contents: [
            {
                ...bundleResource('/foo.js', { targetFilePath: 'foo.js' }),
                isSubstituted: false,
                analysis: emptySubstitutionAnalysis()
            },
            {
                ...bundleResource('/LICENSE', { targetFilePath: 'LICENSE', isExplicitlyIncluded: true }),
                isSubstituted: false,
                analysis: emptySubstitutionAnalysis()
            }
        ],
        packageJson: { name: packageName, version: '21' },
        exportsField: { '.': { import: './foo.js' } },
        mainFile: { content: '', isExecutable: false, inputFilePath: '/foo.js', targetFilePath: 'foo.js' },
        manifestFile: { content: '', isExecutable: false, filePath: '/bar.js' }
    });
}

const entryWithFooImport = {
    directDependencies: new Set([ 'foo.js' ]),
    fileDescription: {
        content: 'import "./foo.js";',
        isExecutable: false,
        inputFilePath: '/entry.js',
        targetFilePath: 'entry.js'
    },
    isSubstituted: false,
    isExplicitlyIncluded: false,
    moduleReferences: [
        { type: 'local-code', sourceSpecifier: './foo.js', emittedSpecifier: './foo.js', targetFilePath: 'foo.js' }
    ]
} as const;

const fooFileResult = {
    directDependencies: new Set<string>(),
    fileDescription: {
        content: 'true',
        isExecutable: false,
        inputFilePath: '/foo.js',
        targetFilePath: 'foo.js'
    },
    isSubstituted: false,
    isExplicitlyIncluded: false,
    moduleReferences: []
} as const;

const entryFooSetup = [
    { source: '/entry.js', content: 'import "./foo.js";', directDependencies: [ '/foo.js' ] },
    { source: '/foo.js', content: 'true' }
] as const;

function substitutedEntryContent(packageName: string): unknown {
    return {
        directDependencies: new Set(),
        fileDescription: {
            inputFilePath: '/entry.js',
            isExecutable: false,
            targetFilePath: 'entry.js',
            content: `import "${packageName}";`
        },
        isSubstituted: true,
        isExplicitlyIncluded: false,
        moduleReferences: [
            {
                type: 'linked-code',
                packageName,
                sourceSpecifier: './foo.js',
                emittedSpecifier: packageName,
                targetFilePath: 'foo.js'
            }
        ]
    };
}

function substitutedEntryResult(packageName: string): unknown {
    return {
        contents: [ substitutedEntryContent(packageName) ],
        externalDependencies: new Map(),
        linkedBundleDependencies: new Map([ [
            packageName,
            {
                name: packageName,
                referencedFrom: [ 'entry.js' ],
                references: [
                    {
                        targetFilePath: 'entry.js',
                        sourceSpecifier: './foo.js',
                        emittedSpecifier: packageName
                    }
                ]
            }
        ] ]),
        substitutedInputFilePathsByPackageName: new Map([ [ packageName, new Set([ '/foo.js' ]) ] ])
    };
}

function buildEntryFooProject(): Project {
    return createProject({
        withFiles: [
            { filePath: '/entry.js', content: 'import "./foo.js";' },
            { filePath: '/foo.js', content: 'true;' }
        ]
    });
}

function buildEntryFooGraph(): ResourceGraph {
    const project = buildEntryFooProject();
    return buildInputGraph([
        { source: '/entry.js', content: 'import "./foo.js";', directDependencies: [ '/foo.js' ], project },
        { source: '/foo.js', content: 'true', project }
    ]);
}

function buildEntryFooLicenseGraph(): ResourceGraph {
    const project = buildEntryFooProject();
    return buildInputGraph([
        { source: '/entry.js', content: 'import "./foo.js";', directDependencies: [ '/foo.js' ], project },
        { source: '/foo.js', content: 'true', project },
        { source: '/LICENSE', content: 'license text', isExplicitlyIncluded: true }
    ]);
}

function entryWithLicenseResult(packageName: string): unknown {
    return {
        contents: [
            substitutedEntryContent(packageName),
            {
                directDependencies: new Set(),
                fileDescription: {
                    content: 'license text',
                    isExecutable: false,
                    inputFilePath: '/LICENSE',
                    targetFilePath: 'LICENSE'
                },
                isSubstituted: false,
                isExplicitlyIncluded: true,
                moduleReferences: []
            }
        ],
        externalDependencies: new Map(),
        linkedBundleDependencies: new Map([ [
            packageName,
            {
                name: packageName,
                referencedFrom: [ 'entry.js' ],
                references: [ {
                    targetFilePath: 'entry.js',
                    sourceSpecifier: './foo.js',
                    emittedSpecifier: packageName
                } ]
            }
        ] ]),
        substitutedInputFilePathsByPackageName: new Map([ [ packageName, new Set([ '/foo.js' ]) ] ])
    };
}

function assertPreservesOwnedLicense(
    packageName: string,
    bundleDependencies: readonly VersionedBundleWithManifest[],
    bundlePeerDependencies: readonly VersionedBundleWithManifest[]
): void {
    const inputGraph = buildEntryFooLicenseGraph();
    const substitutedGraph = substituteDependencies(inputGraph, bundleDependencies, bundlePeerDependencies);
    const result = substitutedGraph.flatten([ '/entry.js' ]);

    assert.strictEqual(substitutedGraph.isKnown('/foo.js'), false);
    assert.strictEqual(substitutedGraph.isKnown('/LICENSE'), true);
    assert.partialDeepStrictEqual(result, entryWithLicenseResult(packageName));
    assert.deepStrictEqual(Array.from(result.sourceMapTransformsByTargetPath.keys()), [ 'entry.js' ]);
}

const passthroughResult = {
    contents: [ entryWithFooImport, fooFileResult ],
    externalDependencies: new Map(),
    linkedBundleDependencies: new Map(),
    substitutedInputFilePathsByPackageName: new Map(),
    sourceMapTransformsByTargetPath: new Map()
} as const;

suite('substitute-bundles', function () {
    suite('passthrough', function () {
        test('doesn’t substitute anything when the given dependencies are empty', function () {
            const inputGraph = buildInputGraph(entryFooSetup);
            const substitutedGraph = substituteDependencies(inputGraph, [], []);
            const result = substitutedGraph.flatten([ '/entry.js' ]);

            assert.deepStrictEqual(result, passthroughResult);
        });

        test('doesn’t substitute anything when the given dependencies has only files that don’t match', function () {
            const inputGraph = buildInputGraph(entryFooSetup);
            const substitutedGraph = substituteDependencies(
                inputGraph,
                [ bundleSource('first-package', '/bar.js') ],
                []
            );
            const result = substitutedGraph.flatten([ '/entry.js' ]);

            assert.deepStrictEqual(result, passthroughResult);
        });
    });

    test('throws when a dependency owns a referenced file but does not expose it publicly', function () {
        const inputGraph = buildInputGraph(entryFooSetup);

        assert.throws(function () {
            substituteDependencies(inputGraph, [
                versionedBundleWithManifest({
                    name: 'hidden-package',
                    version: '1.0.0',
                    roots: {
                        main: {
                            js: {
                                inputFilePath: '/bar.js',
                                targetFilePath: 'bar.js',
                                content: '',
                                isExecutable: false
                            }
                        }
                    },
                    surface: {
                        mode: 'explicit',
                        packageInterface: {
                            modules: [ { root: 'main', export: '.' } ]
                        }
                    },
                    contents: [
                        {
                            ...bundleResource('/foo.js', { targetFilePath: 'foo.js' }),
                            isSubstituted: false,
                            analysis: emptySubstitutionAnalysis()
                        },
                        {
                            ...bundleResource('/unused.js', { targetFilePath: 'unused.js' }),
                            isSubstituted: false,
                            analysis: emptySubstitutionAnalysis()
                        }
                    ],
                    packageJson: { name: 'hidden-package', version: '1.0.0' },
                    exportsField: { '.': { import: './bar.js' } },
                    mainFile: { content: '', isExecutable: false, inputFilePath: '/bar.js', targetFilePath: 'bar.js' },
                    manifestFile: { content: '', isExecutable: false, filePath: '/bar.js' }
                })
            ], []);
        }, /^Error: Package "hidden-package" does not expose "\/foo\.js" for cross-package substitution$/u);
    });

    suite('dependency references', function () {
        test('substitutes a file that has imports statements matching the files in the given dependencies and returns a new graph eliminating unnecessary files', function () {
            const inputGraph = buildEntryFooGraph();
            const substitutedGraph = substituteDependencies(inputGraph, [ bundleSource('the-package', '/foo.js') ], []);
            const result = substitutedGraph.flatten([ '/entry.js' ]);

            assert.partialDeepStrictEqual(result, substitutedEntryResult('the-package'));
            assert.deepStrictEqual(Array.from(result.sourceMapTransformsByTargetPath.keys()), [ 'entry.js' ]);
            assert.strictEqual(result.sourceMapTransformsByTargetPath.get('entry.js')?.length, 1);
        });

        test('records dependency references when substituting without a TypeScript project', function () {
            const inputGraph = buildInputGraph(entryFooSetup);
            const substitutedGraph = substituteDependencies(inputGraph, [ bundleSource('the-package', '/foo.js') ], []);
            const result = substitutedGraph.flatten([ '/entry.js' ]);

            assert.deepStrictEqual(result.linkedBundleDependencies.get('the-package')?.references, [
                {
                    targetFilePath: 'entry.js',
                    sourceSpecifier: 'the-package',
                    emittedSpecifier: 'the-package'
                }
            ]);
        });
    });

    test('substitutes a file which matches an already substituted file from a dependency', function () {
        const inputGraph = buildEntryFooGraph();
        const substitutedGraph = substituteDependencies(
            inputGraph,
            [ bundleSource('first-package', '/foo.js', true) ],
            []
        );
        const result = substitutedGraph.flatten([ '/entry.js' ]);

        assert.partialDeepStrictEqual(result, substitutedEntryResult('first-package'));
        assert.deepStrictEqual(Array.from(result.sourceMapTransformsByTargetPath.keys()), [ 'entry.js' ]);
    });

    test('substitutes peer dependency files without carrying their source nodes forward', function () {
        const inputGraph = buildEntryFooGraph();
        const substitutedGraph = substituteDependencies(inputGraph, [], [ bundleSource('peer-package', '/foo.js') ]);
        const result = substitutedGraph.flatten([ '/entry.js' ]);

        assert.strictEqual(substitutedGraph.isKnown('/foo.js'), false);
        assert.partialDeepStrictEqual(result, substitutedEntryResult('peer-package'));
        assert.deepStrictEqual(Array.from(result.sourceMapTransformsByTargetPath.keys()), [ 'entry.js' ]);
    });

    test('preserves explicitly included files owned by a substituted bundle dependency', function () {
        const bundleDependencies = [ bundleSourceWithExtraFile('regular-package') ];

        assertPreservesOwnedLicense('regular-package', bundleDependencies, []);
    });

    test('preserves explicitly included files owned by a substituted peer bundle dependency', function () {
        const bundlePeerDependencies = [ bundleSourceWithExtraFile('peer-package') ];

        assertPreservesOwnedLicense('peer-package', [], bundlePeerDependencies);
    });

    test('substitutes multiple matching files in the given dependencies', function () {
        const project = createProject({
            withFiles: [
                { filePath: '/entry.js', content: 'import "./foo.js";' },
                { filePath: '/foo.js', content: 'import "./bar.js"; import "./baz.js";' },
                { filePath: '/bar.js', content: 'true;' },
                { filePath: '/baz.js', content: 'true;' }
            ]
        });
        const inputGraph = buildInputGraph([
            { source: '/entry.js', content: 'import "./foo.js";', directDependencies: [ '/foo.js' ], project },
            {
                source: '/foo.js',
                content: 'import "./bar.js"; import "./baz.js";',
                directDependencies: [ '/bar.js', '/baz.js' ],
                project
            },
            { source: '/bar.js', content: 'true;', project },
            { source: '/baz.js', content: 'true;', project }
        ]);
        const substitutedGraph = substituteDependencies(inputGraph, [
            bundleSource('first-package', '/bar.js'),
            bundleSource('second-package', '/baz.js')
        ], []);
        const result = substitutedGraph.flatten([ '/entry.js' ]);

        assert.partialDeepStrictEqual(result, {
            contents: [
                entryWithFooImport,
                {
                    directDependencies: new Set(),
                    fileDescription: {
                        content: 'import "first-package"; import "second-package";',
                        isExecutable: false,
                        inputFilePath: '/foo.js',
                        targetFilePath: 'foo.js'
                    },
                    isSubstituted: true,
                    isExplicitlyIncluded: false,
                    moduleReferences: [
                        {
                            type: 'linked-code',
                            packageName: 'first-package',
                            sourceSpecifier: './bar.js',
                            emittedSpecifier: 'first-package',
                            targetFilePath: 'bar.js'
                        },
                        {
                            type: 'linked-code',
                            packageName: 'second-package',
                            sourceSpecifier: './baz.js',
                            emittedSpecifier: 'second-package',
                            targetFilePath: 'baz.js'
                        }
                    ]
                }
            ],
            externalDependencies: new Map(),
            linkedBundleDependencies: new Map([
                [
                    'first-package',
                    {
                        name: 'first-package',
                        referencedFrom: [ 'foo.js' ],
                        references: [ {
                            targetFilePath: 'foo.js',
                            sourceSpecifier: './bar.js',
                            emittedSpecifier: 'first-package'
                        } ]
                    }
                ],
                [
                    'second-package',
                    {
                        name: 'second-package',
                        referencedFrom: [ 'foo.js' ],
                        references: [ {
                            targetFilePath: 'foo.js',
                            sourceSpecifier: './baz.js',
                            emittedSpecifier: 'second-package'
                        } ]
                    }
                ]
            ]),
            substitutedInputFilePathsByPackageName: new Map([
                [ 'first-package', new Set([ '/bar.js' ]) ],
                [ 'second-package', new Set([ '/baz.js' ]) ]
            ])
        });
        assert.deepStrictEqual(Array.from(result.sourceMapTransformsByTargetPath.keys()), [ 'foo.js' ]);
    });

    test('preserves generated manifest markers while substituting dependencies', function () {
        const project = createProject({
            withFiles: [ { filePath: '/entry.js', content: 'import "./package.json" with { type: "json" };' } ]
        });
        const inputGraph = buildInputGraph([
            {
                source: '/entry.js',
                content: 'import "./package.json" with { type: "json" };',
                directDependencies: [ '/package.json' ],
                project
            },
            { source: '/package.json', content: '{"name":"test"}', isGeneratedManifest: true }
        ]);

        const substitutedGraph = substituteDependencies(inputGraph, [], []);
        const result = substitutedGraph.flatten([ '/entry.js' ]);

        const packageJson = result.contents.find(function (content) {
            return content.fileDescription.inputFilePath === '/package.json';
        });
        assert.partialDeepStrictEqual(packageJson, {
            isGeneratedManifest: true,
            moduleReferences: [],
            directDependencies: new Set()
        });
    });
});
