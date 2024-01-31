import test from 'ava';
import { Maybe } from 'true-myth';
import { buildDependencyGraph } from '../test-libraries/dependency-graph-builder.js';
import { substituteDependencies } from './substitute-bundles.js';
import type { BundleDescription } from './bundle-description.js';

test('doesn’t substitute anything when the given dependencies are empty', (t) => {
    const inputGraph = buildDependencyGraph({
        entries: [
            {
                filePath: '/entry.js',
                content: 'import "./foo.js";',
                dependencies: [
                    {
                        filePath: '/foo.js',
                        content: 'true'
                    }
                ]
            }
        ]
    });
    const substitutedGraph = substituteDependencies(inputGraph, '/entry.js', []);
    const result = substitutedGraph.flatten('/entry.js');

    t.deepEqual(result, inputGraph.flatten('/entry.js'));
});

test('doesn’t substitute anything when the given dependencies has only files that don’t match', (t) => {
    const inputGraph = buildDependencyGraph({
        entries: [
            {
                filePath: '/entry.js',
                content: 'import "./foo.js";',
                dependencies: [
                    {
                        filePath: '/foo.js',
                        content: 'true'
                    }
                ]
            }
        ]
    });
    const bundleDependencies: BundleDescription[] = [
        {
            contents: [{ kind: 'reference', targetFilePath: 'bar.js', sourceFilePath: '/bar.js' }],
            packageJson: { name: 'the-package', version: '1' }
        }
    ];
    const substitutedGraph = substituteDependencies(inputGraph, '/entry.js', bundleDependencies);
    const result = substitutedGraph.flatten('/entry.js');

    t.deepEqual(result, inputGraph.flatten('/entry.js'));
});

test('doesn’t substitute anything when the given dependencies have a matching file but it’s kind is "source"', (t) => {
    const inputGraph = buildDependencyGraph({
        entries: [
            {
                filePath: '/entry.js',
                content: 'import "./foo.js";',
                dependencies: [
                    {
                        filePath: '/foo.js',
                        content: 'true'
                    }
                ]
            }
        ]
    });
    const bundleDependencies: BundleDescription[] = [
        {
            contents: [{ kind: 'source', targetFilePath: 'foo.js', source: '' }],
            packageJson: { name: 'the-package', version: '1' }
        }
    ];
    const substitutedGraph = substituteDependencies(inputGraph, '/entry.js', bundleDependencies);
    const result = substitutedGraph.flatten('/entry.js');

    t.deepEqual(result, inputGraph.flatten('/entry.js'));
});

test('substitutes a file that has imports statements matching the files in the given dependencies and returns a new graph eliminating unnecessary files', (t) => {
    const inputGraph = buildDependencyGraph({
        entries: [
            {
                filePath: '/entry.js',
                content: 'import "./foo.js";',
                dependencies: [
                    {
                        filePath: '/foo.js',
                        content: 'true'
                    }
                ]
            }
        ]
    });
    const bundleDependencies: BundleDescription[] = [
        {
            contents: [{ kind: 'reference', targetFilePath: 'foo.js', sourceFilePath: '/foo.js' }],
            packageJson: { name: 'the-package', version: '1' }
        }
    ];
    const substitutedGraph = substituteDependencies(inputGraph, '/entry.js', bundleDependencies);
    const result = substitutedGraph.flatten('/entry.js');

    t.deepEqual(result, {
        localFiles: [
            {
                filePath: '/entry.js',
                substitutionContent: Maybe.just('import "the-package/foo.js";')
            }
        ],
        topLevelDependencies: { 'the-package': '1' }
    });
});

test('substitutes a file which matches an already substituted file from a dependency', (t) => {
    const inputGraph = buildDependencyGraph({
        entries: [
            {
                filePath: '/entry.js',
                content: 'import "./foo.js";',
                dependencies: [
                    {
                        filePath: '/foo.js',
                        content: 'true'
                    }
                ]
            }
        ]
    });
    const bundleDependencies: BundleDescription[] = [
        {
            contents: [{ kind: 'substituted', targetFilePath: 'foo.js', sourceFilePath: '/foo.js', source: '' }],
            packageJson: { name: 'the-package', version: '1' }
        }
    ];
    const substitutedGraph = substituteDependencies(inputGraph, '/entry.js', bundleDependencies);
    const result = substitutedGraph.flatten('/entry.js');

    t.deepEqual(result, {
        localFiles: [
            {
                filePath: '/entry.js',
                substitutionContent: Maybe.just('import "the-package/foo.js";')
            }
        ],
        topLevelDependencies: { 'the-package': '1' }
    });
});

test('merges topLevelDependencies correctly when multiple files are substituted with the same package', (t) => {
    const inputGraph = buildDependencyGraph({
        entries: [
            {
                filePath: '/entry.js',
                content: 'import "./foo.js";',
                topLevelDependencies: new Map([['pkg1', '2']]),
                dependencies: [
                    {
                        filePath: '/foo.js',
                        content: 'import "./bar.js";',
                        topLevelDependencies: new Map([['pkg2', '3']]),
                        dependencies: [
                            {
                                filePath: '/bar.js',
                                content: 'true',
                                topLevelDependencies: new Map([['pkg3', '4']])
                            }
                        ]
                    }
                ]
            }
        ]
    });
    const bundleDependencies: BundleDescription[] = [
        {
            contents: [{ kind: 'reference', targetFilePath: 'bar.js', sourceFilePath: '/bar.js' }],
            packageJson: { name: 'the-package', version: '1' }
        }
    ];
    const substitutedGraph = substituteDependencies(inputGraph, '/entry.js', bundleDependencies);
    const result = substitutedGraph.flatten('/entry.js');

    t.deepEqual(result, {
        localFiles: [
            {
                filePath: '/entry.js',
                substitutionContent: Maybe.nothing()
            },
            {
                filePath: '/foo.js',
                substitutionContent: Maybe.just('import "the-package/bar.js";')
            }
        ],
        topLevelDependencies: { 'the-package': '1', pkg1: '2', pkg2: '3' }
    });
});

test('substitutes multiple matching files in the given dependencies', (t) => {
    const inputGraph = buildDependencyGraph({
        entries: [
            {
                filePath: '/entry.js',
                content: 'import "./foo.js";',
                topLevelDependencies: new Map([['pkg1', '2']]),
                dependencies: [
                    {
                        filePath: '/foo.js',
                        content: 'import "./bar.js"; import "./baz.js";',
                        topLevelDependencies: new Map([['pkg1', '3']]),
                        dependencies: [
                            {
                                filePath: '/bar.js',
                                content: 'true',
                                topLevelDependencies: new Map([['pkg2', '4']])
                            },
                            {
                                filePath: '/baz.js',
                                content: 'true',
                                topLevelDependencies: new Map([['pkg2', '4']])
                            }
                        ]
                    }
                ]
            }
        ]
    });
    const bundleDependencies: BundleDescription[] = [
        {
            contents: [{ kind: 'reference', targetFilePath: 'bar.js', sourceFilePath: '/bar.js' }],
            packageJson: { name: 'first-package', version: '21' }
        },
        {
            contents: [{ kind: 'reference', targetFilePath: 'baz.js', sourceFilePath: '/baz.js' }],
            packageJson: { name: 'second-package', version: '42' }
        }
    ];
    const substitutedGraph = substituteDependencies(inputGraph, '/entry.js', bundleDependencies);
    const result = substitutedGraph.flatten('/entry.js');

    t.deepEqual(result, {
        localFiles: [
            {
                filePath: '/entry.js',
                substitutionContent: Maybe.nothing()
            },
            {
                filePath: '/foo.js',
                substitutionContent: Maybe.just('import "first-package/bar.js"; import "second-package/baz.js";')
            }
        ],
        topLevelDependencies: { 'first-package': '21', 'second-package': '42', pkg1: '3' }
    });
});
