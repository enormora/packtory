import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Maybe } from 'true-myth';
import { createFakeFileManager, type FakeFileManager } from '../test-libraries/fake-file-manager.ts';
import { createSourceMapFileLocator, type SourceMapFileLocator } from './source-map-file-locator.ts';

type Overrides = {
    readonly readFileContent?: string;
    readonly isReadable?: boolean;
    readonly realPaths?: readonly string[];
};

type SourceMapFileLocatorFixture = {
    readonly locator: SourceMapFileLocator;
    readonly fileManager: FakeFileManager;
};

function sourceMapFileLocatorFactory(overrides: Overrides = {}): SourceMapFileLocatorFixture {
    const { readFileContent = '', isReadable = false } = overrides;
    const fileManager = createFakeFileManager({
        simulatedReadFileResponses: [ { value: readFileContent } ],
        simulatedCheckReadabilityResponses: [ { value: { isReadable } } ],
        simulatedRealPathResponses: (overrides.realPaths ?? []).map(function (filePath) {
            return { value: filePath };
        })
    });

    return {
        locator: createSourceMapFileLocator({ fileManager }),
        fileManager
    };
}

suite('source-map-file-locator', function () {
    suite('missing source maps', function () {
        test('reads the content of the given source file', async function () {
            const { locator, fileManager } = sourceMapFileLocatorFactory();

            await locator.locate('/foo/bar.js', '/foo');

            assert.strictEqual(fileManager.getReadFileCallCount(), 1);
            assert.deepStrictEqual(fileManager.getReadFileCall(0), { filePath: '/foo/bar.js' });
        });

        async function expectLocateReturnsNothingWithoutCheckReadability(content: string): Promise<void> {
            const { locator, fileManager } = sourceMapFileLocatorFactory({
                readFileContent: content,
                isReadable: true
            });

            const result = await locator.locate('/foo/bar.js', '/foo');

            assert.deepStrictEqual(result, Maybe.nothing());
            assert.strictEqual(fileManager.getCheckReadabilityCallCount(), 0);
        }

        test('returns nothing when there is no external source mapping URL referenced in the given file', async function () {
            await expectLocateReturnsNothingWithoutCheckReadability('no sourceMappingURL comment');
        });

        test('returns nothing when the sourceMappingURL text is not at the start of a line comment', async function () {
            await expectLocateReturnsNothingWithoutCheckReadability('const url = "//# sourceMappingURL=baz.map";');
        });

        test('returns nothing when the sourceMappingURL comment appears after code on a later line', async function () {
            await expectLocateReturnsNothingWithoutCheckReadability(
                'const x = 1;\nconst y = 2; //# sourceMappingURL=baz.map'
            );
        });

        test('returns nothing when the sourceMappingURL comment does not contain a file name', async function () {
            await expectLocateReturnsNothingWithoutCheckReadability('foo\n//# sourceMappingURL=');
        });
    });

    suite('source map references', function () {
        suite('reference parsing', function () {
            test('reads the named capture group value as the source map file name', async function () {
                const { locator, fileManager } = sourceMapFileLocatorFactory({
                    readFileContent: 'foo\n//# sourceMappingURL=../maps/baz.map',
                    isReadable: false
                });

                const result = await locator.locate('/foo/bar.js', '/');

                assert.deepStrictEqual(result, Maybe.nothing());
                assert.deepStrictEqual(fileManager.getCheckReadabilityCall(0), { fileOrFolderPath: '/maps/baz.map' });
            });

            test('returns nothing when the sourceMappingURL contains a query string', async function () {
                const { locator, fileManager } = sourceMapFileLocatorFactory({
                    readFileContent: 'foo\n//# sourceMappingURL=../maps/baz.map?hash=1',
                    isReadable: false
                });

                const result = await locator.locate('/foo/bar.js', '/');

                assert.deepStrictEqual(result, Maybe.nothing());
                assert.strictEqual(fileManager.getCheckReadabilityCallCount(), 0);
            });

            test('returns nothing when the sourceMappingURL contains a fragment', async function () {
                const { locator, fileManager } = sourceMapFileLocatorFactory({
                    readFileContent: 'foo\n//# sourceMappingURL=../maps/baz.map#fragment',
                    isReadable: true
                });

                const result = await locator.locate('/foo/bar.js', '/');

                assert.deepStrictEqual(result, Maybe.nothing());
                assert.strictEqual(fileManager.getCheckReadabilityCallCount(), 0);
            });

            test('returns nothing when the sourceMappingURL is URL-like', async function () {
                const urlLikeReferences = [
                    'https://example.com/baz.map',
                    'https://example.com/baz.map',
                    'file:///tmp/baz.map',
                    'node+custom:maps/baz.map',
                    'a1+.-:maps/baz.map'
                ];

                for (const reference of urlLikeReferences) {
                    const { locator, fileManager } = sourceMapFileLocatorFactory({
                        readFileContent: `foo\n//# sourceMappingURL=${reference}`,
                        isReadable: true
                    });

                    const result = await locator.locate('/foo/bar.js', '/');

                    assert.deepStrictEqual(result, Maybe.nothing());
                    assert.strictEqual(fileManager.getCheckReadabilityCallCount(), 0);
                }
            });

            test('treats URL-like text as a URL only when the scheme starts the sourceMappingURL', async function () {
                const { locator, fileManager } = sourceMapFileLocatorFactory({
                    readFileContent: 'foo\n//# sourceMappingURL=./foohttp://example.map',
                    isReadable: false
                });

                const result = await locator.locate('/foo/bar.js', '/foo');

                assert.deepStrictEqual(result, Maybe.nothing());
                assert.deepStrictEqual(fileManager.getCheckReadabilityCall(0), {
                    fileOrFolderPath: '/foo/foohttp:/example.map'
                });
            });

            test('returns nothing when the sourceMappingURL is absolute or lacks a map extension', async function () {
                for (
                    const reference of [
                        '/absolute/baz.map',
                        '\\absolute\\baz.map',
                        'C:\\absolute\\baz.map',
                        '../maps/baz.js'
                    ]
                ) {
                    const { locator, fileManager } = sourceMapFileLocatorFactory({
                        readFileContent: `foo\n//# sourceMappingURL=${reference}`,
                        isReadable: true
                    });

                    const result = await locator.locate('/foo/bar.js', '/');

                    assert.deepStrictEqual(result, Maybe.nothing());
                    assert.strictEqual(fileManager.getCheckReadabilityCallCount(), 0);
                }
            });
        });

        suite('resolved files', function () {
            test('returns nothing when the source map resolves outside the source folder', async function () {
                const { locator, fileManager } = sourceMapFileLocatorFactory({
                    readFileContent: 'foo\n//# sourceMappingURL=../baz.map',
                    isReadable: true
                });

                const result = await locator.locate('/foo/bar.js', '/foo');

                assert.deepStrictEqual(result, Maybe.nothing());
                assert.strictEqual(fileManager.getCheckReadabilityCallCount(), 0);
            });

            test('checks if the referenced source mapping file is readable on the file system', async function () {
                const { locator, fileManager } = sourceMapFileLocatorFactory({
                    readFileContent: 'foo\n//# sourceMappingURL=baz.map',
                    isReadable: false
                });

                await locator.locate('/foo/bar.js', '/foo');

                assert.strictEqual(fileManager.getCheckReadabilityCallCount(), 1);
                assert.deepStrictEqual(fileManager.getCheckReadabilityCall(0), { fileOrFolderPath: '/foo/baz.map' });
            });

            test('returns the path to the referenced source map file when it is readable', async function () {
                const { locator } = sourceMapFileLocatorFactory({
                    readFileContent: 'foo\n//# sourceMappingURL=../maps/baz.map',
                    isReadable: true
                });

                const result = await locator.locate('/foo/bar.js', '/');

                assert.deepStrictEqual(result, Maybe.just('/maps/baz.map'));
            });

            test('returns nothing when the readable source map real path leaves the source folder', async function () {
                const { locator, fileManager } = sourceMapFileLocatorFactory({
                    readFileContent: 'foo\n//# sourceMappingURL=baz.map',
                    isReadable: true,
                    realPaths: [ '/real/source', '/real/outside/baz.map' ]
                });

                const result = await locator.locate('/source/bar.js', '/source');

                assert.deepStrictEqual(result, Maybe.nothing());
                assert.deepStrictEqual(fileManager.getAllRealPathCalls(), [
                    { filePath: '/source' },
                    { filePath: '/source/baz.map' }
                ]);
            });

            test('returns nothing when the source map real path is the source folder itself', async function () {
                const { locator } = sourceMapFileLocatorFactory({
                    readFileContent: 'foo\n//# sourceMappingURL=baz.map',
                    isReadable: true,
                    realPaths: [ '/real/source', '/real/source' ]
                });

                const result = await locator.locate('/source/bar.js', '/source');

                assert.deepStrictEqual(result, Maybe.nothing());
            });

            test('returns nothing when there is an external source mapping file referenced but it can’t be read', async function () {
                const { locator } = sourceMapFileLocatorFactory({
                    readFileContent: 'foo\n//# sourceMappingURL=baz.map',
                    isReadable: false
                });

                const result = await locator.locate('/foo/bar.js', '/foo');

                assert.deepStrictEqual(result, Maybe.nothing());
            });
        });
    });
});
