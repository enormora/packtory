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

    test('returns nothing when the sourceMappingURL contains a query string', async function () {
        const { locator, fileManager } = sourceMapFileLocatorFactory({
            readFileContent: 'foo\n//# sourceMappingURL=../maps/baz.map?hash=1',
            isReadable: false
        });

        const result = await locator.locate('/foo/bar.js', '/');

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

    test('returns nothing when there is an external source mapping file referenced but it can’t be read', async function () {
        const { locator } = sourceMapFileLocatorFactory({
            readFileContent: 'foo\n//# sourceMappingURL=baz.map',
            isReadable: false
        });

        const result = await locator.locate('/foo/bar.js', '/foo');

        assert.deepStrictEqual(result, Maybe.nothing());
    });
});
