import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Maybe } from 'true-myth';
import { createFakeFileManager, type FakeFileManager } from '../test-libraries/fake-file-manager.ts';
import { createSourceMapFileLocator, type SourceMapFileLocator } from './source-map-file-locator.ts';

type Overrides = {
    readonly readFileContent?: string;
    readonly isReadable?: boolean;
};

type SourceMapFileLocatorFixture = {
    readonly locator: SourceMapFileLocator;
    readonly fileManager: FakeFileManager;
};

function sourceMapFileLocatorFactory(overrides: Overrides = {}): SourceMapFileLocatorFixture {
    const { readFileContent = '', isReadable = false } = overrides;
    const fileManager = createFakeFileManager({
        simulatedReadFileResponses: [ { value: readFileContent } ],
        simulatedCheckReadabilityResponses: [ { value: { isReadable } } ]
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

    test('reads the named capture group value as the source map file name', async function () {
        const { locator, fileManager } = sourceMapFileLocatorFactory({
            readFileContent: 'foo\n//# sourceMappingURL=../maps/baz.map',
            isReadable: false
        });

        const result = await locator.locate('/foo/bar.js', '/');

        assert.deepStrictEqual(result, Maybe.nothing());
        assert.deepStrictEqual(fileManager.getCheckReadabilityCall(0), { fileOrFolderPath: '/maps/baz.map' });
    });

    suite('invalid sourceMappingURL values', function () {
        async function expectSourceMappingUrlIgnored(sourceMappingUrl: string): Promise<void> {
            const { locator, fileManager } = sourceMapFileLocatorFactory({
                readFileContent: `foo\n//# sourceMappingURL=${sourceMappingUrl}`,
                isReadable: true
            });

            const result = await locator.locate('/foo/bar.js', '/foo');

            assert.deepStrictEqual(result, Maybe.nothing());
            assert.strictEqual(fileManager.getCheckReadabilityCallCount(), 0);
        }

        test('returns nothing when the sourceMappingURL contains a query string', async function () {
            const { locator, fileManager } = sourceMapFileLocatorFactory({
                readFileContent: 'foo\n//# sourceMappingURL=../maps/baz.map?hash=1',
                isReadable: false
            });

            const result = await locator.locate('/foo/bar.js', '/');

            assert.deepStrictEqual(result, Maybe.nothing());
            assert.strictEqual(fileManager.getCheckReadabilityCallCount(), 0);
        });

        for (
            const [ testName, sourceMappingUrl ] of [
                [ 'https URL', 'https://example.test/baz.map' ],
                [ 'scheme URL with digits', 'h3://example.test/baz.map' ],
                [ 'custom protocol URL', 'webpack://pkg/source.js.map' ],
                [ 'query-only suffix', 'baz.map?hash=1' ],
                [ 'fragment-only suffix', 'baz.map#hash' ],
                [ 'non-map extension', 'baz.txt' ],
                [ 'Windows absolute path', 'C:\\maps\\baz.map' ],
                [ 'Windows UNC absolute path', '\\\\server\\share\\baz.map' ],
                [ 'POSIX absolute path', '/maps/baz.map' ]
            ] as const
        ) {
            test(`returns nothing when the sourceMappingURL contains a ${testName}`, async function () {
                await expectSourceMappingUrlIgnored(sourceMappingUrl);
            });
        }

        test('returns nothing when the referenced source map resolves outside the sources folder', async function () {
            await expectSourceMappingUrlIgnored('../baz.map');
        });
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

    test('treats a URL-like string after a path segment as a relative source map path', async function () {
        const { locator, fileManager } = sourceMapFileLocatorFactory({
            readFileContent: 'foo\n//# sourceMappingURL=maps/http:cache.map',
            isReadable: true
        });

        const result = await locator.locate('/foo/bar.js', '/foo');

        assert.deepStrictEqual(result, Maybe.just('/foo/maps/http:cache.map'));
        assert.strictEqual(fileManager.getCheckReadabilityCallCount(), 1);
    });

    test('returns nothing when the referenced source map resolves to the sources folder itself', async function () {
        const { locator, fileManager } = sourceMapFileLocatorFactory({
            readFileContent: 'foo\n//# sourceMappingURL=baz.map',
            isReadable: true
        });

        const result = await locator.locate('/foo/index.js', '/foo/baz.map');

        assert.deepStrictEqual(result, Maybe.nothing());
        assert.strictEqual(fileManager.getCheckReadabilityCallCount(), 0);
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
