import assert from 'node:assert';
import { test } from 'mocha';
import type { Project } from 'ts-morph';
import { bundleResource, versionedBundleWithManifest } from '../test-libraries/bundle-fixtures.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import { createGraphFromResolvedBundle } from './resource-graph.ts';
import { substituteDependencies } from './substitute-bundles.ts';

type ResolvedContentDescription = {
    readonly source: string;
    readonly content: string;
    readonly directDependencies?: readonly string[];
    readonly project?: Project;
};

function buildInputGraph(
    contents: readonly ResolvedContentDescription[],
    entryPath = '/entry.js'
): ReturnType<typeof createGraphFromResolvedBundle> {
    const root = {
        js: { content: '', isExecutable: false, sourceFilePath: entryPath, targetFilePath: 'entry.js' },
        declarationFile: undefined
    } as const;
    return createGraphFromResolvedBundle({
        contents: contents.map((entry) => {
            return {
                ...bundleResource(entry.source, {
                    content: entry.content,
                    directDependencies: new Set(entry.directDependencies)
                }),
                project: entry.project
            };
        }),
        roots: { main: root },
        entryPoints: [root],
        surface: { mode: 'implicit', defaultModuleRoot: 'main' },
        externalDependencies: new Map(),
        name: 'test-bundle'
    });
}

function bundleSource(packageName: string, sourceFilePath: string, isSubstituted = false): VersionedBundleWithManifest {
    const targetFilePath = sourceFilePath.replace(/^\//u, '');
    return versionedBundleWithManifest({
        name: packageName,
        version: '21',
        roots: { main: { js: { content: '', isExecutable: false, sourceFilePath, targetFilePath } } },
        surface: { mode: 'implicit', defaultModuleRoot: 'main' },
        contents: [
            {
                ...bundleResource(sourceFilePath, { targetFilePath }),
                isSubstituted,
                analysis: {
                    survivingBindings: new Set<string>(),
                    sideEffectStatements: [],
                    sideEffectImports: new Set<string>()
                }
            }
        ],
        packageJson: { name: packageName, version: '21' },
        exportsField: { '.': { import: `./${targetFilePath}` } },
        mainFile: { content: '', isExecutable: false, sourceFilePath: '/bar.js', targetFilePath: 'bar.js' },
        manifestFile: { content: '', isExecutable: false, filePath: '/bar.js' }
    });
}

const entryWithFooImport = {
    directDependencies: new Set(['/foo.js']),
    fileDescription: {
        content: 'import "./foo.js";',
        isExecutable: false,
        sourceFilePath: '/entry.js',
        targetFilePath: 'entry.js'
    },
    isSubstituted: false,
    isExplicitlyIncluded: false
} as const;

const fooFileResult = {
    directDependencies: new Set<string>(),
    fileDescription: {
        content: 'true',
        isExecutable: false,
        sourceFilePath: '/foo.js',
        targetFilePath: 'foo.js'
    },
    isSubstituted: false,
    isExplicitlyIncluded: false
} as const;

const entryFooSetup = [
    { source: '/entry.js', content: 'import "./foo.js";', directDependencies: ['/foo.js'] },
    { source: '/foo.js', content: 'true' }
] as const;

function substitutedEntryResult(packageName: string): unknown {
    return {
        contents: [
            {
                directDependencies: new Set(),
                fileDescription: {
                    sourceFilePath: '/entry.js',
                    isExecutable: false,
                    targetFilePath: 'entry.js',
                    content: `import "${packageName}";`
                },
                isSubstituted: true,
                isExplicitlyIncluded: false
            }
        ],
        externalDependencies: new Map(),
        linkedBundleDependencies: new Map([[packageName, { name: packageName, referencedFrom: ['/entry.js'] }]])
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

const passthroughResult = {
    contents: [entryWithFooImport, fooFileResult],
    externalDependencies: new Map(),
    linkedBundleDependencies: new Map()
} as const;

test('doesn’t substitute anything when the given dependencies are empty', () => {
    const inputGraph = buildInputGraph(entryFooSetup);
    const substitutedGraph = substituteDependencies(inputGraph, []);
    const result = substitutedGraph.flatten(['/entry.js']);

    assert.deepStrictEqual(result, passthroughResult);
});

test('doesn’t substitute anything when the given dependencies has only files that don’t match', () => {
    const inputGraph = buildInputGraph(entryFooSetup);
    const substitutedGraph = substituteDependencies(inputGraph, [bundleSource('first-package', '/bar.js')]);
    const result = substitutedGraph.flatten(['/entry.js']);

    assert.deepStrictEqual(result, passthroughResult);
});

test('throws when a dependency owns a referenced file but does not expose it publicly', () => {
    const inputGraph = buildInputGraph(entryFooSetup);

    assert.throws(() => {
        substituteDependencies(inputGraph, [
            versionedBundleWithManifest({
                name: 'hidden-package',
                version: '1.0.0',
                roots: {
                    main: {
                        js: {
                            sourceFilePath: '/bar.js',
                            targetFilePath: 'bar.js',
                            content: '',
                            isExecutable: false
                        }
                    }
                },
                surface: {
                    mode: 'explicit',
                    packageInterface: {
                        modules: [{ root: 'main', export: '.' }]
                    }
                },
                contents: [
                    {
                        ...bundleResource('/foo.js', { targetFilePath: 'foo.js' }),
                        isSubstituted: false,
                        analysis: {
                            survivingBindings: new Set<string>(),
                            sideEffectStatements: [],
                            sideEffectImports: new Set<string>()
                        }
                    },
                    {
                        ...bundleResource('/unused.js', { targetFilePath: 'unused.js' }),
                        isSubstituted: false,
                        analysis: {
                            survivingBindings: new Set<string>(),
                            sideEffectStatements: [],
                            sideEffectImports: new Set<string>()
                        }
                    }
                ],
                packageJson: { name: 'hidden-package', version: '1.0.0' },
                exportsField: { '.': { import: './bar.js' } },
                mainFile: { content: '', isExecutable: false, sourceFilePath: '/bar.js', targetFilePath: 'bar.js' },
                manifestFile: { content: '', isExecutable: false, filePath: '/bar.js' }
            })
        ]);
    }, /^Error: Package "hidden-package" does not expose "\/foo\.js" for cross-package substitution$/u);
});

test('substitutes a file that has imports statements matching the files in the given dependencies and returns a new graph eliminating unnecessary files', () => {
    const project = buildEntryFooProject();
    const inputGraph = buildInputGraph([
        { source: '/entry.js', content: 'import "./foo.js";', directDependencies: ['/foo.js'], project },
        { source: '/foo.js', content: 'true', project }
    ]);
    const substitutedGraph = substituteDependencies(inputGraph, [bundleSource('the-package', '/foo.js')]);
    const result = substitutedGraph.flatten(['/entry.js']);

    assert.deepStrictEqual(result, substitutedEntryResult('the-package'));
});

test('substitutes a file which matches an already substituted file from a dependency', () => {
    const project = buildEntryFooProject();
    const inputGraph = buildInputGraph([
        { source: '/entry.js', content: 'import "./foo.js";', directDependencies: ['/foo.js'], project },
        { source: '/foo.js', content: 'true', project }
    ]);
    const substitutedGraph = substituteDependencies(inputGraph, [bundleSource('first-package', '/foo.js', true)]);
    const result = substitutedGraph.flatten(['/entry.js']);

    assert.deepStrictEqual(result, substitutedEntryResult('first-package'));
});

test('substitutes multiple matching files in the given dependencies', () => {
    const project = createProject({
        withFiles: [
            { filePath: '/entry.js', content: 'import "./foo.js";' },
            { filePath: '/foo.js', content: 'import "./bar.js"; import "./baz.js";' },
            { filePath: '/bar.js', content: 'true;' },
            { filePath: '/baz.js', content: 'true;' }
        ]
    });
    const inputGraph = buildInputGraph([
        { source: '/entry.js', content: 'import "./foo.js";', directDependencies: ['/foo.js'], project },
        {
            source: '/foo.js',
            content: 'import "./bar.js"; import "./baz.js";',
            directDependencies: ['/bar.js', '/baz.js'],
            project
        },
        { source: '/bar.js', content: 'true;', project },
        { source: '/baz.js', content: 'true;', project }
    ]);
    const substitutedGraph = substituteDependencies(inputGraph, [
        bundleSource('first-package', '/bar.js'),
        bundleSource('second-package', '/baz.js')
    ]);
    const result = substitutedGraph.flatten(['/entry.js']);

    assert.deepStrictEqual(result, {
        contents: [
            {
                directDependencies: new Set(['/foo.js']),
                fileDescription: {
                    content: 'import "./foo.js";',
                    isExecutable: false,
                    sourceFilePath: '/entry.js',
                    targetFilePath: 'entry.js'
                },
                isSubstituted: false,
                isExplicitlyIncluded: false
            },
            {
                directDependencies: new Set(),
                fileDescription: {
                    content: 'import "first-package"; import "second-package";',
                    isExecutable: false,
                    sourceFilePath: '/foo.js',
                    targetFilePath: 'foo.js'
                },
                isSubstituted: true,
                isExplicitlyIncluded: false
            }
        ],
        externalDependencies: new Map(),
        linkedBundleDependencies: new Map([
            ['first-package', { name: 'first-package', referencedFrom: ['/foo.js'] }],
            ['second-package', { name: 'second-package', referencedFrom: ['/foo.js'] }]
        ])
    });
});
