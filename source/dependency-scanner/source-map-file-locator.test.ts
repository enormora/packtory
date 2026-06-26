import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Maybe } from 'true-myth';
import { createFakeFileManager, type FakeFileManager } from '../test-libraries/fake-file-manager.ts';
import { createSourceMapFileLocator, type SourceMapFileLocator } from './source-map-file-locator.ts';

type Overrides = {
    readonly readFileContent?: string;
    readonly isReadable?: boolean;
};

function sourceMapFileLocatorFactory(overrides: Overrides = {}): {
    readonly locator: SourceMapFileLocator;
    readonly fileManager: FakeFileManager;
} {
    const { readFileContent = '', isReadable = false } = overrides;
    const fileManager = createFakeFileManager({
        simulatedReadFileResponses: [{ value: readFileContent }],
        simulatedCheckReadabilityResponses: [{ value: { isReadable } }]
    });

    return {
        locator: createSourceMapFileLocator({ fileManager }),
        fileManager
    };
}

suite('source-map-file-locator', function () {
    test('reads the content of the given source file', async function () {
        const { locator, fileManager } = sourceMapFileLocatorFactory();

        await locator.locate('/foo/bar.js', '/foo');

        assert.strictEqual(fileManager.getReadFileCallCount(), 1);
        assert.deepStrictEqual(fileManager.getReadFileCall(0), { filePath: '/foo/bar.js' });
    });

    async function expectLocateReturnsNothingWithoutCheckReadability(content: string): Promise<void> {
        const { locator, fileManager } = sourceMapFileLocatorFactory({ readFileContent: content, isReadable: true });

        const result = await locator.locate('/foo/bar.js', '/foo');

        assert.deepStrictEqual(result, Maybe.nothing());
        assert.strictEqual(fileManager.getCheckReadabilityCallCount(), 0);
    }

    test('returns nothing when there is no external source mapping URL referenced in the given file', async function () {
        await expectLocateReturnsNothingWithoutCheckReadability('no sourceMappingURL comment');
        await expectLocateReturnsNothingWithoutCheckReadability('baz.map');
    });

    test('returns nothing when the sourceMappingURL text is not at the start of a line comment', async function () {
        await expectLocateReturnsNothingWithoutCheckReadability('const url = "//# sourceMappingURL=baz.map.js";');
    });

    test('returns nothing when the sourceMappingURL comment appears after code on a later line', async function () {
        await expectLocateReturnsNothingWithoutCheckReadability(
            'const x = 1;\nconst y = 2; //# sourceMappingURL=baz.map.js'
        );
    });

    test('returns nothing when the sourceMappingURL comment does not contain a file name', async function () {
        await expectLocateReturnsNothingWithoutCheckReadability('foo\n//# sourceMappingURL=');
    });

    test('returns nothing for source map paths that are not contained relative map files', async function () {
        for (const sourceMappingUrl of [
            '../maps/baz.map',
            'maps/baz.map?hash=1',
            '/foo/baz.map',
            '/outside/secret.map',
            'C:\\secret.map',
            '\\\\server\\share\\file.map',
            'https://example.test/file.map',
            'secret.txt'
        ]) {
            const { locator, fileManager } = sourceMapFileLocatorFactory({
                readFileContent: `foo\n//# sourceMappingURL=${sourceMappingUrl}`,
                isReadable: true
            });

            const result = await locator.locate('/foo/bar.js', '/foo');

            assert.deepStrictEqual(result, Maybe.nothing(), sourceMappingUrl);
            assert.strictEqual(fileManager.getCheckReadabilityCallCount(), 0, sourceMappingUrl);
        }
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
            readFileContent: 'foo\n//# sourceMappingURL=maps/baz.map',
            isReadable: true
        });

        const result = await locator.locate('/foo/bar.js', '/foo');

        assert.deepStrictEqual(result, Maybe.just('/foo/maps/baz.map'));
    });

    test('ignores plain map file names before the sourceMappingURL comment', async function () {
        const { locator } = sourceMapFileLocatorFactory({
            readFileContent: 'maps/ignored.map\n//# sourceMappingURL=maps/baz.map',
            isReadable: true
        });

        const result = await locator.locate('/foo/bar.js', '/foo');

        assert.deepStrictEqual(result, Maybe.just('/foo/maps/baz.map'));
    });

    test('returns a relative source map path whose later path segment contains a colon', async function () {
        const { locator } = sourceMapFileLocatorFactory({
            readFileContent: 'foo\n//# sourceMappingURL=maps/http:file.map',
            isReadable: true
        });

        const result = await locator.locate('/foo/bar.js', '/foo');

        assert.deepStrictEqual(result, Maybe.just('/foo/maps/http:file.map'));
    });

    test('returns nothing when a readable source map resolves outside the sources folder', async function () {
        const fileManager = createFakeFileManager({
            simulatedReadFileResponses: [{ value: 'foo\n//# sourceMappingURL=linked.map' }],
            simulatedCheckReadabilityResponses: [{ value: { isReadable: true } }],
            simulatedRealPathResponses: [{ value: '/foo' }, { value: '/outside/linked.map' }]
        });
        const locator = createSourceMapFileLocator({ fileManager });

        const result = await locator.locate('/foo/bar.js', '/foo');

        assert.deepStrictEqual(result, Maybe.nothing());
    });

    test('returns nothing when a readable source map resolves to the sources folder itself', async function () {
        const fileManager = createFakeFileManager({
            simulatedReadFileResponses: [{ value: 'foo\n//# sourceMappingURL=linked.map' }],
            simulatedCheckReadabilityResponses: [{ value: { isReadable: true } }],
            simulatedRealPathResponses: [{ value: '/foo' }, { value: '/foo' }]
        });
        const locator = createSourceMapFileLocator({ fileManager });

        const result = await locator.locate('/foo/bar.js', '/foo');

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
