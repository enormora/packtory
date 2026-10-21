import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { AnalyzedBundleResource } from '../dead-code-eliminator/analyzed-bundle.ts';
import { analyzedBundleResource, linkedBundle } from '../test-libraries/bundle-fixtures.ts';
import { inspectFileDiscovery } from './package-file-discovery.ts';

function resource(name: string, dependencies: readonly string[]): AnalyzedBundleResource {
    return analyzedBundleResource(`/repo/${name}`, {
        targetFilePath: name,
        directDependencies: new Set(dependencies)
    });
}

function inspect(
    contents: readonly AnalyzedBundleResource[],
    retained: readonly AnalyzedBundleResource[]
): ReturnType<typeof inspectFileDiscovery> {
    const entry = resource('index.js', []);
    return inspectFileDiscovery(
        linkedBundle({
            contents,
            roots: { main: { javaScript: entry.fileDescription } }
        }),
        retained,
        '/repo'
    );
}

suite('package-file-discovery', function () {
    test('lists only retained files while preserving discovery through removed intermediates', function () {
        const entry = resource('index.js', [ 'middle.js' ]);
        const middle = resource('middle.js', [ 'leaf.js' ]);
        const leaf = resource('leaf.js', []);
        assert.deepStrictEqual(inspect([ entry, middle, leaf ], [ leaf, entry ]), [
            {
                packagePath: './index.js',
                sourcePath: 'index.js',
                kind: 'file',
                discovery: {
                    type: 'discovered',
                    chain: [
                        { packagePath: './index.js', sourcePath: 'index.js', via: 'root' }
                    ]
                }
            },
            {
                packagePath: './leaf.js',
                sourcePath: 'leaf.js',
                kind: 'file',
                discovery: {
                    type: 'discovered',
                    chain: [
                        { packagePath: './index.js', sourcePath: 'index.js', via: 'root' },
                        { packagePath: './middle.js', sourcePath: 'middle.js', via: 'import' },
                        { packagePath: './leaf.js', sourcePath: 'leaf.js', via: 'import' }
                    ]
                }
            }
        ]);
    });

    test('chooses the shortest path and terminates on cycles and missing targets', function () {
        const entry = resource('index.js', [ 'long.js', 'leaf.js', 'missing.js' ]);
        const long = resource('long.js', [ 'leaf.js' ]);
        const leaf = resource('leaf.js', [ 'index.js' ]);
        assert.deepStrictEqual(inspect([ long, leaf, entry ], [ leaf ])[0]?.discovery, {
            type: 'discovered',
            chain: [
                { packagePath: './index.js', sourcePath: 'index.js', via: 'root' },
                { packagePath: './leaf.js', sourcePath: 'leaf.js', via: 'import' }
            ]
        });
    });

    test('breaks equal-length ties by package path regardless of input order', function () {
        const entry = resource('index.js', [ 'z.js', 'a.js' ]);
        const firstBranch = resource('a.js', [ 'leaf.js' ]);
        const lastBranch = resource('z.js', [ 'leaf.js' ]);
        const leaf = resource('leaf.js', []);
        const first = inspect([ entry, firstBranch, lastBranch, leaf ], [ leaf ]);
        const second = inspect([ leaf, lastBranch, firstBranch, {
            ...entry,
            directDependencies: new Set([ 'a.js', 'z.js' ])
        } ], [ leaf ]);
        assert.deepStrictEqual(first, second);
        assert.deepStrictEqual(first[0]?.discovery, {
            type: 'discovered',
            chain: [
                { packagePath: './index.js', sourcePath: 'index.js', via: 'root' },
                { packagePath: './a.js', sourcePath: 'a.js', via: 'import' },
                { packagePath: './leaf.js', sourcePath: 'leaf.js', via: 'import' }
            ]
        });
    });

    test('seeds all roots and declaration roots, with stable ties and root precedence', function () {
        const firstBranch = { ...resource('a.js', [ 'leaf.js' ]), isExplicitlyIncluded: true };
        const lastBranch = resource('z.js', [ 'leaf.js' ]);
        const declaration = resource('a.d.ts', []);
        const leaf = resource('leaf.js', []);
        const result = inspectFileDiscovery(
            linkedBundle({
                contents: [ lastBranch, leaf, declaration, firstBranch ],
                roots: {
                    last: { javaScript: lastBranch.fileDescription },
                    first: { javaScript: firstBranch.fileDescription, declarationFile: declaration.fileDescription }
                }
            }),
            [ firstBranch, declaration, leaf ],
            '/repo'
        );
        assert.deepStrictEqual(
            result.map(function (file) {
                return file.discovery;
            }),
            [
                { type: 'discovered', chain: [ { packagePath: './a.d.ts', sourcePath: 'a.d.ts', via: 'root' } ] },
                { type: 'discovered', chain: [ { packagePath: './a.js', sourcePath: 'a.js', via: 'root' } ] },
                {
                    type: 'discovered',
                    chain: [
                        { packagePath: './a.js', sourcePath: 'a.js', via: 'root' },
                        { packagePath: './leaf.js', sourcePath: 'leaf.js', via: 'import' }
                    ]
                }
            ]
        );
    });

    test('starts additional files at explicit inclusions and follows their dependencies', function () {
        const extra = { ...resource('LICENSE', [ 'asset.json' ]), isExplicitlyIncluded: true };
        const asset = resource('asset.json', []);
        assert.deepStrictEqual(inspect([ extra, asset ], [ asset ])[0]?.discovery, {
            type: 'discovered',
            chain: [
                { packagePath: './LICENSE', sourcePath: 'LICENSE', via: 'additional-file' },
                { packagePath: './asset.json', sourcePath: 'asset.json', via: 'import' }
            ]
        });
    });

    test('distinguishes source map attachments from ordinary imports of map files', function () {
        const entry = resource('index.js', [ 'index.js.map', 'other.map' ]);
        const map = resource('index.js.map', []);
        const other = resource('other.map', []);
        const result = inspect([ entry, map, other ], [ map, other ]);
        assert.deepStrictEqual(
            result.map(function (file) {
                return file.discovery;
            }),
            [
                {
                    type: 'discovered',
                    chain: [
                        { packagePath: './index.js', sourcePath: 'index.js', via: 'root' },
                        { packagePath: './index.js.map', sourcePath: 'index.js.map', via: 'source-map' }
                    ]
                },
                {
                    type: 'discovered',
                    chain: [
                        { packagePath: './index.js', sourcePath: 'index.js', via: 'root' },
                        { packagePath: './other.map', sourcePath: 'other.map', via: 'import' }
                    ]
                }
            ]
        );
    });

    test('connects declaration companions by source path even when package paths differ', function () {
        const runtime = resource('index.js', []);
        const declaration = {
            ...resource('index.d.ts', [ 'types.d.ts' ]),
            fileDescription: {
                ...resource('index.d.ts', []).fileDescription,
                targetFilePath: 'renamed.d.ts'
            }
        };
        const types = resource('types.d.ts', []);
        assert.deepStrictEqual(inspect([ runtime, declaration, types ], [ types ])[0]?.discovery, {
            type: 'discovered',
            chain: [
                { packagePath: './index.js', sourcePath: 'index.js', via: 'root' },
                { packagePath: './renamed.d.ts', sourcePath: 'index.d.ts', via: 'declaration-companion' },
                { packagePath: './types.d.ts', sourcePath: 'types.d.ts', via: 'import' }
            ]
        });
    });

    test('prefers actual dependency edges when a companion also has an import edge', function () {
        const runtime = resource('index.js', [ 'index.d.ts' ]);
        const declaration = resource('index.d.ts', []);
        const discovery = inspect([ runtime, declaration ], [ declaration ])[0]?.discovery;
        assert.deepStrictEqual(discovery, {
            type: 'discovered',
            chain: [
                { packagePath: './index.js', sourcePath: 'index.js', via: 'root' },
                { packagePath: './index.d.ts', sourcePath: 'index.d.ts', via: 'import' }
            ]
        });
    });

    test('marks generated manifest references without a source path', function () {
        const entry = resource('index.js', [ 'package.json' ]);
        const manifest = { ...resource('package.json', []), isGeneratedManifest: true as const };
        assert.deepStrictEqual(inspect([ entry, manifest ], [ manifest ])[0], {
            packagePath: './package.json',
            sourcePath: undefined,
            kind: 'generated-manifest',
            discovery: {
                type: 'discovered',
                chain: [
                    { packagePath: './index.js', sourcePath: 'index.js', via: 'root' },
                    { packagePath: './package.json', sourcePath: undefined, via: 'import' }
                ]
            }
        });
    });

    test('reports unavailable discovery rather than inventing a chain', function () {
        assert.deepStrictEqual(inspect([], [ resource('unknown.js', []) ])[0]?.discovery, {
            type: 'unavailable',
            reason: 'no-discovery-path'
        });
        assert.deepStrictEqual(inspect([], []), []);
    });
});
