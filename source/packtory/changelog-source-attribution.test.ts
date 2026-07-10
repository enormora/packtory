import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import type { AnalyzedBundle, AnalyzedBundleResource } from '../dead-code-eliminator/analyzed-bundle.ts';
import { analyzedBundle, analyzedBundleResource } from '../test-libraries/bundle-fixtures.ts';
import { createFakeFileManager, type FakeFileManager } from '../test-libraries/fake-file-manager.ts';
import {
    attributeChangelogSourceFiles,
    attributeSelectedChangelogSourceFiles,
    changedPackageManifestDependencyNames,
    collectManifestChangelogSourceFiles,
    isPackageManifestInputPath,
    packageManifestDependencyVersions
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
                assertDefined((error as Error).cause);
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
    test('collectManifestChangelogSourceFiles includes package.json when generated manifest inputs exist', function () {
        assert.deepStrictEqual(
            collectManifestChangelogSourceFiles({ dependencies: { left: '^1.0.0' } }, [ 'README.md' ]),
            [ 'package.json', 'README.md' ]
        );
        assert.deepStrictEqual(
            collectManifestChangelogSourceFiles({ peerDependencies: { react: '^19.0.0' } }, []),
            [ 'package.json' ]
        );
        assert.deepStrictEqual(
            collectManifestChangelogSourceFiles({ imports: { '#runtime': './runtime.js' } }, []),
            [ 'package.json' ]
        );
    });

    test('collectManifestChangelogSourceFiles omits package.json when generated manifest inputs are empty', function () {
        assert.deepStrictEqual(
            collectManifestChangelogSourceFiles(
                { dependencies: {}, peerDependencies: {}, imports: {} },
                [ 'README.md' ]
            ),
            [ 'README.md' ]
        );
    });

    test('isPackageManifestInputPath recognizes manifest and lock files only', function () {
        assert.strictEqual(isPackageManifestInputPath('package.json'), true);
        assert.strictEqual(isPackageManifestInputPath('package-lock.json'), true);
        assert.strictEqual(isPackageManifestInputPath('npm-shrinkwrap.json'), true);
        assert.strictEqual(isPackageManifestInputPath('pnpm-lock.yaml'), true);
        assert.strictEqual(isPackageManifestInputPath('yarn.lock'), true);
        assert.strictEqual(isPackageManifestInputPath('packages/pkg/package.json'), false);
        assert.strictEqual(isPackageManifestInputPath('README.md'), false);
    });

    test('changedPackageManifestDependencyNames returns sorted changes across dependency fields', function () {
        const previousManifest = JSON.stringify({
            dependencies: { left: '1.0.0', shared: '1.0.0' },
            optionalDependencies: { optional: '1.0.0' },
            peerDependencies: { react: '^18.0.0' }
        });
        const currentManifest = JSON.stringify({
            dependencies: { right: '1.0.0', shared: '1.0.0' },
            optionalDependencies: { optional: '1.0.1' },
            peerDependencies: { react: '^19.0.0' }
        });

        assert.deepStrictEqual(changedPackageManifestDependencyNames(previousManifest, currentManifest), [
            'left',
            'optional',
            'react',
            'right'
        ]);
    });

    test('changedPackageManifestDependencyNames ignores non-object manifests and fields', function () {
        assert.deepStrictEqual(changedPackageManifestDependencyNames('[]', '{}'), []);
        assert.deepStrictEqual(changedPackageManifestDependencyNames('{}', 'null'), []);
        assert.deepStrictEqual(
            changedPackageManifestDependencyNames(
                JSON.stringify({ dependencies: [ 'left' ] }),
                JSON.stringify({ dependencies: { left: '1.0.0' } })
            ),
            [ 'left' ]
        );
    });

    test('packageManifestDependencyVersions returns current versions for dependency names', function () {
        const manifest = JSON.stringify({
            dependencies: { shared: '1.0.0' },
            optionalDependencies: { optional: '1.0.1' },
            peerDependencies: { react: '^19.0.0', right: '2.0.0' }
        });

        assert.deepStrictEqual(packageManifestDependencyVersions(manifest, [ 'left', 'optional', 'react', 'right' ]), [
            { name: 'optional', version: '1.0.1' },
            { name: 'react', version: '^19.0.0' },
            { name: 'right', version: '2.0.0' }
        ]);
    });

    test('packageManifestDependencyVersions ignores non-object manifests', function () {
        assert.deepStrictEqual(packageManifestDependencyVersions('[]', [ 'left' ]), []);
    });
}

function registerSelectedSourceTests(): void {
    test('attributeSelectedChangelogSourceFiles attributes only selected artifact files', async function () {
        const fileManager = createFakeFileManager({
            simulatedReadFileResponses: [ { value: 'export const value = 1;\n' } ]
        });
        const result = await attributeSelectedChangelogSourceFiles(
            { fileManager, repositoryFolder: '/repo' },
            bundleWith([
                analyzedBundleResource('/repo/source/included.js', { targetFilePath: 'dist/included.js' }),
                analyzedBundleResource('/repo/source/skipped.js', { targetFilePath: 'dist/skipped.js' })
            ]),
            [ 'README.md' ],
            new Set([ 'dist/included.js' ])
        );

        assert.deepStrictEqual(result, [ 'source/included.js' ]);
        assert.strictEqual(fileManager.getReadFileCallCount(), 1);
        assert.deepStrictEqual(fileManager.getReadFileCall(0), { filePath: '/repo/source/included.js' });
    });

    test('attributeSelectedChangelogSourceFiles excludes generated manifests even when selected', async function () {
        const generatedManifest = {
            ...analyzedBundleResource('/repo/source/package.json', { targetFilePath: 'package.json' }),
            isGeneratedManifest: true as const
        };
        const result = await attributeSelectedChangelogSourceFiles(
            { fileManager: createFakeFileManager(), repositoryFolder: '/repo' },
            bundleWith([ generatedManifest ]),
            [ 'source/package.json', 'README.md' ],
            new Set([ 'package.json' ])
        );

        assert.deepStrictEqual(result, [ 'source/package.json' ]);
    });

    test('attributeSelectedChangelogSourceFiles attributes selected additional package files', async function () {
        const result = await attributeSelectedChangelogSourceFiles(
            { fileManager: createFakeFileManager(), repositoryFolder: '/repo' },
            bundleWith([
                analyzedBundleResource('/repo/source/README.md', { targetFilePath: 'README.md' }),
                analyzedBundleResource('/repo/source/LICENSE', { targetFilePath: 'LICENSE' })
            ]),
            [],
            new Set([ 'README.md' ])
        );

        assert.deepStrictEqual(result, [ 'source/README.md' ]);
    });
}

suite('changelog-source-attribution', function () {
    registerManifestInputTests();
    registerJavaScriptAttributionTests();
    registerSourceMapFailureTests();
    registerDirectSourceTests();
    registerSelectedSourceTests();
});
