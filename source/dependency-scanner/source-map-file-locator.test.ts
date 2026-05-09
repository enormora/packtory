import assert from 'node:assert';
import { test } from 'mocha';
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

test('reads the content of the given source file', async () => {
    const { locator, fileManager } = sourceMapFileLocatorFactory();

    await locator.locate('/foo/bar.js');

    assert.strictEqual(fileManager.getReadFileCallCount(), 1);
    assert.deepStrictEqual(fileManager.getReadFileCall(0), { filePath: '/foo/bar.js' });
});

async function expectLocateReturnsNothingWithoutCheckReadability(content: string): Promise<void> {
    const { locator, fileManager } = sourceMapFileLocatorFactory({ readFileContent: content, isReadable: true });

    const result = await locator.locate('/foo/bar.js');

    assert.deepStrictEqual(result, Maybe.nothing());
    assert.strictEqual(fileManager.getCheckReadabilityCallCount(), 0);
}

test('returns nothing when there is no external source mapping URL referenced in the given file', async () => {
    await expectLocateReturnsNothingWithoutCheckReadability('no sourceMappingURL comment');
});

test('returns nothing when the sourceMappingURL text is not at the start of a line comment', async () => {
    await expectLocateReturnsNothingWithoutCheckReadability('const url = "//# sourceMappingURL=baz.map.js";');
});

test('returns nothing when the sourceMappingURL comment appears after code on a later line', async () => {
    await expectLocateReturnsNothingWithoutCheckReadability(
        'const x = 1;\nconst y = 2; //# sourceMappingURL=baz.map.js'
    );
});

test('returns nothing when the sourceMappingURL comment does not contain a file name', async () => {
    await expectLocateReturnsNothingWithoutCheckReadability('foo\n//# sourceMappingURL=');
});

test('reads the named capture group value as the source map file name', async () => {
    const { locator, fileManager } = sourceMapFileLocatorFactory({
        readFileContent: 'foo\n//# sourceMappingURL=../maps/baz.map.js',
        isReadable: false
    });

    const result = await locator.locate('/foo/bar.js');

    assert.deepStrictEqual(result, Maybe.nothing());
    assert.deepStrictEqual(fileManager.getCheckReadabilityCall(0), { fileOrFolderPath: '/maps/baz.map.js' });
});

test('uses the full sourceMappingURL capture up to the end of the line', async () => {
    const { locator, fileManager } = sourceMapFileLocatorFactory({
        readFileContent: 'foo\n//# sourceMappingURL=../maps/baz.map.js?hash=1',
        isReadable: false
    });

    await locator.locate('/foo/bar.js');

    assert.deepStrictEqual(fileManager.getCheckReadabilityCall(0), { fileOrFolderPath: '/maps/baz.map.js?hash=1' });
});

test('checks if the referenced source mapping file is readable on the file system', async () => {
    const { locator, fileManager } = sourceMapFileLocatorFactory({
        readFileContent: 'foo\n//# sourceMappingURL=baz.map.js',
        isReadable: false
    });

    await locator.locate('/foo/bar.js');

    assert.strictEqual(fileManager.getCheckReadabilityCallCount(), 1);
    assert.deepStrictEqual(fileManager.getCheckReadabilityCall(0), { fileOrFolderPath: '/foo/baz.map.js' });
});

test('returns the path to the referenced source map file when it is readable', async () => {
    const { locator } = sourceMapFileLocatorFactory({
        readFileContent: 'foo\n//# sourceMappingURL=../maps/baz.map.js',
        isReadable: true
    });

    const result = await locator.locate('/foo/bar.js');

    assert.deepStrictEqual(result, Maybe.just('/maps/baz.map.js'));
});

test('returns nothing when there is an external source mapping file referenced but it can’t be read', async () => {
    const { locator } = sourceMapFileLocatorFactory({
        readFileContent: 'foo\n//# sourceMappingURL=baz.map.js',
        isReadable: false
    });

    const result = await locator.locate('/foo/bar.js');

    assert.deepStrictEqual(result, Maybe.nothing());
});
