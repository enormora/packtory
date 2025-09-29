import test from 'ava';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import { substituteDependencies } from './substitute-bundles.ts';
import { createGraphFromResolvedBundle } from './resource-graph.ts';

test('doesn’t substitute anything when the given dependencies are empty', (t) => {
    const inputGraph = createGraphFromResolvedBundle({
        contents: [
            {
                fileDescription: {
                    content: 'import "./foo.js";',
                    isExecutable: false,
                    sourceFilePath: '/entry.js',
                    targetFilePath: 'entry.js'
                },
                directDependencies: new Set(['/foo.js'])
            },
            {
                fileDescription: {
                    content: 'true',
                    isExecutable: false,
                    sourceFilePath: '/foo.js',
                    targetFilePath: 'foo.js'
                },
                directDependencies: new Set()
            }
        ],
        entryPoints: [
            {
                js: { content: '', isExecutable: false, sourceFilePath: '/entry.js', targetFilePath: 'entry.js' },
                declarationFile: undefined
            }
        ],
        externalDependencies: new Map(),
        name: 'test-bundle'
    });
    const substitutedGraph = substituteDependencies(inputGraph, []);
    const result = substitutedGraph.flatten(['/entry.js']);

    t.deepEqual(result, {
        contents: [
            {
                directDependencies: new Set(['/foo.js']),
                fileDescription: {
                    content: 'import "./foo.js";',
                    isExecutable: false,
                    sourceFilePath: '/entry.js',
                    targetFilePath: 'entry.js'
                },
                isSubstituted: false
            },
            {
                directDependencies: new Set([]),
                fileDescription: {
                    content: 'true',
                    isExecutable: false,
                    sourceFilePath: '/foo.js',
                    targetFilePath: 'foo.js'
                },
                isSubstituted: false
            }
        ],
        externalDependencies: new Map(),
        linkedBundleDependencies: new Map()
    });
});

test('doesn’t substitute anything when the given dependencies has only files that don’t match', (t) => {
    const inputGraph = createGraphFromResolvedBundle({
        contents: [
            {
                fileDescription: {
                    content: 'import "./foo.js";',
                    isExecutable: false,
                    sourceFilePath: '/entry.js',
                    targetFilePath: 'entry.js'
                },
                directDependencies: new Set(['/foo.js'])
            },
            {
                fileDescription: {
                    content: 'true',
                    isExecutable: false,
                    sourceFilePath: '/foo.js',
                    targetFilePath: 'foo.js'
                },
                directDependencies: new Set()
            }
        ],
        entryPoints: [
            {
                js: { content: '', isExecutable: false, sourceFilePath: '/entry.js', targetFilePath: 'entry.js' },
                declarationFile: undefined
            }
        ],
        externalDependencies: new Map(),
        name: 'test-bundle'
    });
    const bundleDependencies: VersionedBundleWithManifest[] = [
        {
            contents: [
                {
                    fileDescription: {
                        content: '',
                        isExecutable: false,
                        sourceFilePath: '/bar.js',
                        targetFilePath: 'bar.js'
                    },
                    directDependencies: new Set(),
                    isSubstituted: false
                }
            ],
            packageJson: { name: 'first-package', version: '21' },
            name: 'first-package',
            version: '21',
            dependencies: {},
            peerDependencies: {},
            additionalAttributes: {},
            mainFile: { content: '', isExecutable: false, sourceFilePath: '/bar.js', targetFilePath: 'bar.js' },
            typesMainFile: undefined,
            packageType: 'module',
            manifestFile: { content: '', isExecutable: false, filePath: '/bar.js' }
        }
    ];
    const substitutedGraph = substituteDependencies(inputGraph, bundleDependencies);
    const result = substitutedGraph.flatten(['/entry.js']);

    t.deepEqual(result, {
        contents: [
            {
                directDependencies: new Set(['/foo.js']),
                fileDescription: {
                    content: 'import "./foo.js";',
                    isExecutable: false,
                    sourceFilePath: '/entry.js',
                    targetFilePath: 'entry.js'
                },
                isSubstituted: false
            },
            {
                directDependencies: new Set([]),
                fileDescription: {
                    content: 'true',
                    isExecutable: false,
                    sourceFilePath: '/foo.js',
                    targetFilePath: 'foo.js'
                },
                isSubstituted: false
            }
        ],
        externalDependencies: new Map(),
        linkedBundleDependencies: new Map()
    });
});

test('substitutes a file that has imports statements matching the files in the given dependencies and returns a new graph eliminating unnecessary files', (t) => {
    const project = createProject({
        withFiles: [
            { filePath: '/entry.js', content: 'import "./foo.js";' },
            { filePath: '/foo.js', content: 'true;' }
        ]
    });
    const inputGraph = createGraphFromResolvedBundle({
        contents: [
            {
                fileDescription: {
                    content: 'import "./foo.js";',
                    isExecutable: false,
                    sourceFilePath: '/entry.js',
                    targetFilePath: 'entry.js'
                },
                directDependencies: new Set(['/foo.js']),
                project
            },
            {
                fileDescription: {
                    content: 'true',
                    isExecutable: false,
                    sourceFilePath: '/foo.js',
                    targetFilePath: 'foo.js'
                },
                directDependencies: new Set(),
                project
            }
        ],
        entryPoints: [
            {
                js: { content: '', isExecutable: false, sourceFilePath: '/entry.js', targetFilePath: 'entry.js' },
                declarationFile: undefined
            }
        ],
        externalDependencies: new Map(),
        name: 'test-bundle'
    });
    const bundleDependencies: VersionedBundleWithManifest[] = [
        {
            contents: [
                {
                    fileDescription: {
                        content: '',
                        isExecutable: false,
                        sourceFilePath: '/foo.js',
                        targetFilePath: 'foo.js'
                    },
                    directDependencies: new Set(),
                    isSubstituted: false
                }
            ],
            packageJson: { name: 'the-package', version: '21' },
            name: 'the-package',
            version: '21',
            dependencies: {},
            peerDependencies: {},
            additionalAttributes: {},
            mainFile: { content: '', isExecutable: false, sourceFilePath: '/bar.js', targetFilePath: 'bar.js' },
            typesMainFile: undefined,
            packageType: 'module',
            manifestFile: { content: '', isExecutable: false, filePath: '/bar.js' }
        }
    ];
    const substitutedGraph = substituteDependencies(inputGraph, bundleDependencies);
    const result = substitutedGraph.flatten(['/entry.js']);

    t.deepEqual(result, {
        contents: [
            {
                directDependencies: new Set(),
                fileDescription: {
                    sourceFilePath: '/entry.js',
                    isExecutable: false,
                    targetFilePath: 'entry.js',
                    content: 'import "the-package/foo.js";'
                },
                isSubstituted: true
            }
        ],
        externalDependencies: new Map(),
        linkedBundleDependencies: new Map([['the-package', { name: 'the-package', referencedFrom: ['/entry.js'] }]])
    });
});

test('substitutes a file which matches an already substituted file from a dependency', (t) => {
    const project = createProject({
        withFiles: [
            { filePath: '/entry.js', content: 'import "./foo.js";' },
            { filePath: '/foo.js', content: 'true;' }
        ]
    });
    const inputGraph = createGraphFromResolvedBundle({
        contents: [
            {
                fileDescription: {
                    content: 'import "./foo.js";',
                    isExecutable: false,
                    sourceFilePath: '/entry.js',
                    targetFilePath: 'entry.js'
                },
                directDependencies: new Set(['/foo.js']),
                project
            },
            {
                fileDescription: {
                    content: 'true',
                    isExecutable: false,
                    sourceFilePath: '/foo.js',
                    targetFilePath: 'foo.js'
                },
                directDependencies: new Set(),
                project
            }
        ],
        entryPoints: [
            {
                js: { content: '', isExecutable: false, sourceFilePath: '/entry.js', targetFilePath: 'entry.js' },
                declarationFile: undefined
            }
        ],
        externalDependencies: new Map(),
        name: 'test-bundle'
    });
    const bundleDependencies: VersionedBundleWithManifest[] = [
        {
            contents: [
                {
                    fileDescription: {
                        content: '',
                        isExecutable: false,
                        sourceFilePath: '/foo.js',
                        targetFilePath: 'foo.js'
                    },
                    directDependencies: new Set(),
                    isSubstituted: true
                }
            ],
            packageJson: { name: 'first-package', version: '21' },
            name: 'first-package',
            version: '21',
            dependencies: {},
            peerDependencies: {},
            additionalAttributes: {},
            mainFile: { content: '', isExecutable: false, sourceFilePath: '/bar.js', targetFilePath: 'bar.js' },
            typesMainFile: undefined,
            packageType: 'module',
            manifestFile: { content: '', isExecutable: false, filePath: '/bar.js' }
        }
    ];
    const substitutedGraph = substituteDependencies(inputGraph, bundleDependencies);
    const result = substitutedGraph.flatten(['/entry.js']);

    t.deepEqual(result, {
        contents: [
            {
                directDependencies: new Set(),
                fileDescription: {
                    sourceFilePath: '/entry.js',
                    isExecutable: false,
                    targetFilePath: 'entry.js',
                    content: 'import "first-package/foo.js";'
                },
                isSubstituted: true
            }
        ],
        externalDependencies: new Map(),
        linkedBundleDependencies: new Map([['first-package', { name: 'first-package', referencedFrom: ['/entry.js'] }]])
    });
});

test('substitutes multiple matching files in the given dependencies', (t) => {
    const project = createProject({
        withFiles: [
            { filePath: '/entry.js', content: 'import "./foo.js";' },
            { filePath: '/foo.js', content: 'import "./bar.js"; import "./baz.js";' },
            { filePath: '/bar.js', content: 'true;' },
            { filePath: '/baz.js', content: 'true;' }
        ]
    });
    const inputGraph = createGraphFromResolvedBundle({
        contents: [
            {
                fileDescription: {
                    content: 'import "./foo.js";',
                    isExecutable: false,
                    sourceFilePath: '/entry.js',
                    targetFilePath: 'entry.js'
                },
                directDependencies: new Set(['/foo.js']),
                project
            },
            {
                fileDescription: {
                    content: 'import "./bar.js"; import "./baz.js";',
                    isExecutable: false,
                    sourceFilePath: '/foo.js',
                    targetFilePath: 'foo.js'
                },
                directDependencies: new Set(['/bar.js', '/baz.js']),
                project
            },
            {
                fileDescription: {
                    content: 'true;',
                    isExecutable: false,
                    sourceFilePath: '/bar.js',
                    targetFilePath: 'bar.js'
                },
                directDependencies: new Set(),
                project
            },
            {
                fileDescription: {
                    content: 'true;',
                    isExecutable: false,
                    sourceFilePath: '/baz.js',
                    targetFilePath: 'baz.js'
                },
                directDependencies: new Set(),
                project
            }
        ],
        entryPoints: [
            {
                js: { content: '', isExecutable: false, sourceFilePath: '/entry.js', targetFilePath: 'entry.js' },
                declarationFile: undefined
            }
        ],
        externalDependencies: new Map(),
        name: 'test-bundle'
    });

    const bundleDependencies: VersionedBundleWithManifest[] = [
        {
            contents: [
                {
                    fileDescription: {
                        content: '',
                        isExecutable: false,
                        sourceFilePath: '/bar.js',
                        targetFilePath: 'bar.js'
                    },
                    directDependencies: new Set(),
                    isSubstituted: false
                }
            ],
            packageJson: { name: 'first-package', version: '21' },
            name: 'first-package',
            version: '21',
            dependencies: {},
            peerDependencies: {},
            additionalAttributes: {},
            mainFile: { content: '', isExecutable: false, sourceFilePath: '/bar.js', targetFilePath: 'bar.js' },
            typesMainFile: undefined,
            packageType: 'module',
            manifestFile: { content: '', isExecutable: false, filePath: '/bar.js' }
        },
        {
            contents: [
                {
                    fileDescription: {
                        content: '',
                        isExecutable: false,
                        sourceFilePath: '/baz.js',
                        targetFilePath: 'baz.js'
                    },
                    directDependencies: new Set(),
                    isSubstituted: false
                }
            ],
            packageJson: { name: 'second-package', version: '21' },
            name: 'second-package',
            version: '21',
            dependencies: {},
            peerDependencies: {},
            additionalAttributes: {},
            mainFile: { content: '', isExecutable: false, sourceFilePath: '/baz.js', targetFilePath: 'baz.js' },
            typesMainFile: undefined,
            packageType: 'module',
            manifestFile: { content: '', isExecutable: false, filePath: '/baz.js' }
        }
    ];
    const substitutedGraph = substituteDependencies(inputGraph, bundleDependencies);
    const result = substitutedGraph.flatten(['/entry.js']);

    t.deepEqual(result, {
        contents: [
            {
                directDependencies: new Set(['/foo.js']),
                fileDescription: {
                    content: 'import "./foo.js";',
                    isExecutable: false,
                    sourceFilePath: '/entry.js',
                    targetFilePath: 'entry.js'
                },
                isSubstituted: false
            },
            {
                directDependencies: new Set([]),
                fileDescription: {
                    content: 'import "first-package/bar.js"; import "second-package/baz.js";',
                    isExecutable: false,
                    sourceFilePath: '/foo.js',
                    targetFilePath: 'foo.js'
                },
                isSubstituted: true
            }
        ],
        externalDependencies: new Map(),
        linkedBundleDependencies: new Map([
            ['first-package', { name: 'first-package', referencedFrom: ['/foo.js'] }],
            ['second-package', { name: 'second-package', referencedFrom: ['/foo.js'] }]
        ])
    });
});
