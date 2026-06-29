import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { AnalyzedBundle, AnalyzedBundleResource } from '../dead-code-eliminator/analyzed-bundle.ts';
import { analyzedBundle, analyzedBundleResource } from '../test-libraries/bundle-fixtures.ts';
import { createFakeFileManager, type FakeFileManager } from '../test-libraries/fake-file-manager.ts';
import {
    attributeChangelogSourceFiles,
    attributeSelectedChangelogSourceFiles,
    changedPackageManifestDependencyNames,
    collectManifestChangelogSourceFiles,
    isPackageManifestInputPath
} from './changelog-source-attribution.ts';

function sourceMap(sources: readonly (string | null)[], sourceRoot = ''): string {
    return JSON.stringify({
        version: 3,
        file: 'index.js',
        sourceRoot,
        sources,
        names: [],
        mappings: ''
    });
}

function sourceMapWithoutSourceRoot(sources: readonly string[]): string {
    return JSON.stringify({
        version: 3,
        file: 'index.js',
        sources,
        names: [],
        mappings: ''
    });
}

function bundleWith(contents: readonly AnalyzedBundleResource[]): AnalyzedBundle {
    return analyzedBundle({ contents });
}

function sourceWithMap(mapFilePath: string, code = 'export const value = 1;'): string {
    return `${code}\n//# sourceMappingURL=${mapFilePath}`;
}

function readableMapFileManager(sourceContent: string, mapContent: string): FakeFileManager {
    return createFakeFileManager({
        simulatedReadFileResponses: [ { value: sourceContent }, { value: mapContent } ],
        simulatedCheckReadabilityResponses: [ { value: { isReadable: true } } ]
    });
}

function missingMapFileManager(sourceContent: string): FakeFileManager {
    return createFakeFileManager({
        simulatedReadFileResponses: [ { value: sourceContent } ],
        simulatedCheckReadabilityResponses: [ { value: { isReadable: false } } ]
    });
}

async function attributeSingleFile(fileManager: FakeFileManager, sourceFilePath: string): Promise<readonly string[]> {
    return attributeChangelogSourceFiles(
        { fileManager, repositoryFolder: '/repo' },
        bundleWith([ analyzedBundleResource(sourceFilePath) ]),
        []
    );
}

function registerJavaScriptAttributionTests(): void {
    test('attributes plain JavaScript without a source map to the JavaScript file', async function () {
        const fileManager = createFakeFileManager({
            simulatedReadFileResponses: [ { value: 'export const value = 1;\n' } ]
        });

        const result = await attributeChangelogSourceFiles(
            { fileManager, repositoryFolder: '/repo' },
            bundleWith([ analyzedBundleResource('/repo/source/index.js') ]),
            []
        );

        assert.deepStrictEqual(result, [ 'source/index.js' ]);
    });

    test('attributes JavaScript with an empty sourceMappingURL to the JavaScript file', async function () {
        const fileManager = createFakeFileManager({
            simulatedReadFileResponses: [ { value: 'export const value = 1;\n//# sourceMappingURL=' } ]
        });

        const result = await attributeChangelogSourceFiles(
            { fileManager, repositoryFolder: '/repo' },
            bundleWith([ analyzedBundleResource('/repo/source/index.js') ]),
            []
        );

        assert.deepStrictEqual(result, [ 'source/index.js' ]);
    });

    test('attributes JavaScript with a source map to original TypeScript sources', async function () {
        const result = await attributeSingleFile(
            readableMapFileManager(
                sourceWithMap('index.js.map'),
                sourceMap([ '../source/index.ts', '../source/shared.ts' ])
            ),
            '/repo/dist/index.js'
        );

        assert.deepStrictEqual(result, [ 'source/index.ts', 'source/shared.ts' ]);
    });

    test('attributes JavaScript with a source map that omits sourceRoot', async function () {
        const result = await attributeSingleFile(
            readableMapFileManager(sourceWithMap('index.js.map'), sourceMapWithoutSourceRoot([ '../source/index.ts' ])),
            '/repo/dist/index.js'
        );

        assert.deepStrictEqual(result, [ 'source/index.ts' ]);
    });

    test('attributes CommonJS with a source map to original TypeScript sources', async function () {
        const result = await attributeSingleFile(
            readableMapFileManager(
                sourceWithMap('index.cjs.map', 'exports.value = 1;'),
                sourceMap([ '../source/index.cts' ])
            ),
            '/repo/dist/index.cjs'
        );

        assert.deepStrictEqual(result, [ 'source/index.cts' ]);
    });

    test('resolves sourceRoot and relative source paths from the source map file', async function () {
        const result = await attributeSingleFile(
            readableMapFileManager(sourceWithMap('maps/index.js.map'), sourceMap([ 'index.ts' ], '../../source')),
            '/repo/dist/index.js'
        );

        assert.deepStrictEqual(result, [ 'source/index.ts' ]);
    });
}

function registerSourceMapFailureTests(): void {
    test('fails when a referenced source map is missing', async function () {
        await assert.rejects(
            attributeSingleFile(missingMapFileManager(sourceWithMap('index.js.map')), '/repo/dist/index.js'),
            /Source map "\/repo\/dist\/index\.js\.map" referenced by "\/repo\/dist\/index\.js" is not readable/u
        );
    });

    test('fails when a referenced source map is malformed', async function () {
        await assert.rejects(
            attributeSingleFile(readableMapFileManager(sourceWithMap('index.js.map'), '{'), '/repo/dist/index.js'),
            /Failed to parse source map "\/repo\/dist\/index\.js\.map"/u
        );
    });

    test('preserves the parse error cause for malformed source maps', async function () {
        await assert.rejects(
            attributeSingleFile(readableMapFileManager(sourceWithMap('index.js.map'), '{'), '/repo/dist/index.js'),
            function (error: unknown) {
                assert.strictEqual((error as Error).message, 'Failed to parse source map "/repo/dist/index.js.map"');
                assert.notStrictEqual((error as Error).cause, undefined);
                return true;
            }
        );
    });

    test('fails when a referenced source map contains an empty source', async function () {
        await assert.rejects(
            attributeSingleFile(
                readableMapFileManager(sourceWithMap('index.js.map'), sourceMap([ null ])),
                '/repo/dist/index.js'
            ),
            /Source map "\/repo\/dist\/index\.js\.map" contains an empty source/u
        );
    });

    test('fails when JavaScript contains multiple sourceMappingURL references', async function () {
        const fileManager = createFakeFileManager({
            simulatedReadFileResponses: [
                { value: 'export {};\n//# sourceMappingURL=one.js.map\n//# sourceMappingURL=two.js.map' }
            ]
        });

        await assert.rejects(
            attributeChangelogSourceFiles(
                { fileManager, repositoryFolder: '/repo' },
                bundleWith([ analyzedBundleResource('/repo/dist/index.js') ]),
                []
            ),
            /Multiple sourceMappingURL references found in "\/repo\/dist\/index\.js"/u
        );
    });

    test('fails when a source map source resolves outside the repository folder', async function () {
        await assert.rejects(
            attributeSingleFile(
                readableMapFileManager(sourceWithMap('index.js.map'), sourceMap([ '../../outside/index.ts' ])),
                '/repo/dist/index.js'
            ),
            /Changelog source file "\/outside\/index\.ts" is outside repository folder "\/repo"/u
        );
    });
}

function registerDirectSourceTests(): void {
    test('fails when an attributed source is the repository folder itself', async function () {
        await assert.rejects(
            attributeChangelogSourceFiles(
                { fileManager: createFakeFileManager(), repositoryFolder: '/repo' },
                bundleWith([ analyzedBundleResource('/repo', { targetFilePath: 'repo' }) ]),
                []
            ),
            /Changelog source file "\/repo" is outside repository folder "\/repo"/u
        );
    });

    test('excludes generated manifests', async function () {
        const generatedManifest = {
            ...analyzedBundleResource('/repo/source/package.json', { targetFilePath: 'package.json' }),
            isGeneratedManifest: true as const
        };

        const result = await attributeChangelogSourceFiles(
            { fileManager: createFakeFileManager(), repositoryFolder: '/repo' },
            bundleWith([ generatedManifest, analyzedBundleResource('/repo/source/index.d.ts') ]),
            []
        );

        assert.deepStrictEqual(result, [ 'source/index.d.ts' ]);
    });

    test('excludes selected generated manifests from selected attribution', async function () {
        const generatedManifest = {
            ...analyzedBundleResource('/repo/source/package.json', { targetFilePath: 'package.json' }),
            isGeneratedManifest: true as const
        };

        const result = await attributeSelectedChangelogSourceFiles(
            { fileManager: createFakeFileManager(), repositoryFolder: '/repo' },
            bundleWith([
                generatedManifest,
                analyzedBundleResource('/repo/source/index.js', { targetFilePath: 'package/index.js' })
            ]),
            [ 'manual.md' ],
            new Set([ 'package.json' ])
        );

        assert.deepStrictEqual(result, [ 'manual.md' ]);
    });

    test('includes additional non-code files directly', async function () {
        const result = await attributeChangelogSourceFiles(
            { fileManager: createFakeFileManager(), repositoryFolder: '/repo' },
            bundleWith([
                analyzedBundleResource('/repo/assets/readme.md', {
                    isExplicitlyIncluded: true,
                    targetFilePath: 'readme.md'
                })
            ]),
            []
        );

        assert.deepStrictEqual(result, [ 'assets/readme.md' ]);
    });

    test('does not read declaration, source map, or non-code files', async function () {
        const result = await attributeChangelogSourceFiles(
            {
                fileManager: createFakeFileManager({
                    simulatedReadFileResponses: [ { error: new Error('read failed') } ]
                }),
                repositoryFolder: '/repo'
            },
            bundleWith([
                analyzedBundleResource('/repo/source/index.d.ts'),
                analyzedBundleResource('/repo/source/index.js.map'),
                analyzedBundleResource('/repo/assets/readme.md', { targetFilePath: 'readme.md' })
            ]),
            []
        );

        assert.deepStrictEqual(result, [ 'assets/readme.md', 'source/index.d.ts', 'source/index.js.map' ]);
    });
}

function registerManifestInputTests(): void {
    test('adds package.json to changelog sources when generated manifest inputs exist', function () {
        assert.deepStrictEqual(
            collectManifestChangelogSourceFiles({ imports: { '#entry': './entry.js' } }, [ 'source/index.ts' ]),
            [ 'package.json', 'source/index.ts' ]
        );
        assert.deepStrictEqual(collectManifestChangelogSourceFiles({}, [ 'source/index.ts' ]), [ 'source/index.ts' ]);
    });

    test('does not add package.json for empty generated manifest inputs', function () {
        assert.deepStrictEqual(
            collectManifestChangelogSourceFiles(
                {
                    dependencies: {},
                    imports: {},
                    peerDependencies: {}
                },
                [ 'source/index.ts' ]
            ),
            [ 'source/index.ts' ]
        );
    });

    test('recognizes package manifest input paths', function () {
        assert.deepStrictEqual(
            [
                'package.json',
                'package-lock.json',
                'npm-shrinkwrap.json',
                'pnpm-lock.yaml',
                'yarn.lock'
            ]
                .map(isPackageManifestInputPath),
            [ true, true, true, true, true ]
        );
        assert.strictEqual(isPackageManifestInputPath('source/package.json'), false);
    });

    test('returns no changed dependency names for non-object manifests', function () {
        assert.deepStrictEqual(changedPackageManifestDependencyNames('[]', '{}'), []);
        assert.deepStrictEqual(changedPackageManifestDependencyNames('{}', 'null'), []);
    });

    test('returns changed manifest dependency names across dependency fields', function () {
        const previousManifest = JSON.stringify({
            dependencies: { alpha: '1.0.0', beta: '1.0.0' },
            optionalDependencies: { gamma: '1.0.0' },
            peerDependencies: { delta: '1.0.0' }
        });
        const currentManifest = JSON.stringify({
            dependencies: { alpha: '1.0.1', beta: '1.0.0' },
            optionalDependencies: {},
            peerDependencies: { delta: '1.0.0', epsilon: '1.0.0' }
        });

        assert.deepStrictEqual(changedPackageManifestDependencyNames(previousManifest, currentManifest), [
            'alpha',
            'epsilon',
            'gamma'
        ]);
    });
}

suite('changelog-source-attribution', function () {
    registerJavaScriptAttributionTests();
    registerSourceMapFailureTests();
    registerDirectSourceTests();
    registerManifestInputTests();
});
