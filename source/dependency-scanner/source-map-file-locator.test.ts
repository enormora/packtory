import assert from 'node:assert';
import { test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Maybe } from 'true-myth';
import {
    createSourceMapFileLocator,
    type SourceMapFileLocator,
    type SourceMapFileLocatorDependencies
} from './source-map-file-locator.ts';

type Overrides = {
    readonly readFile?: SinonSpy;
    readonly checkReadability?: SinonSpy;
};

function sourceMapFileLocatorFactory(overrides: Overrides = {}): SourceMapFileLocator {
    const { readFile = fake.resolves(''), checkReadability = fake.resolves(null) } = overrides;
    const fakeDependencies = {
        fileManager: {
            readFile,
            checkReadability
        }
    } as unknown as SourceMapFileLocatorDependencies;

    return createSourceMapFileLocator(fakeDependencies);
}

test('reads the content of the given source file', async () => {
    const readFile = fake.resolves('');
    const locator = sourceMapFileLocatorFactory({ readFile });

    await locator.locate('/foo/bar.js');

    assert.strictEqual(readFile.callCount, 1);
    assert.deepStrictEqual(readFile.firstCall.args, ['/foo/bar.js']);
});

test('returns nothing when there is no external source mapping URL referenced in the given file', async () => {
    const readFile = fake.resolves('no sourceMappingURL comment');
    const checkReadability = fake.resolves({ isReadable: true });
    const locator = sourceMapFileLocatorFactory({ readFile, checkReadability });

    const result = await locator.locate('/foo/bar.js');

    assert.deepStrictEqual(result, Maybe.nothing());
    assert.strictEqual(checkReadability.callCount, 0);
});

test('returns nothing when the sourceMappingURL text is not at the start of a line comment', async () => {
    const readFile = fake.resolves('const url = "//# sourceMappingURL=baz.map.js";');
    const checkReadability = fake.resolves({ isReadable: true });
    const locator = sourceMapFileLocatorFactory({ readFile, checkReadability });

    const result = await locator.locate('/foo/bar.js');

    assert.deepStrictEqual(result, Maybe.nothing());
    assert.strictEqual(checkReadability.callCount, 0);
});

test('returns nothing when the sourceMappingURL comment appears after code on a later line', async () => {
    const readFile = fake.resolves('const x = 1;\nconst y = 2; //# sourceMappingURL=baz.map.js');
    const checkReadability = fake.resolves({ isReadable: true });
    const locator = sourceMapFileLocatorFactory({ readFile, checkReadability });

    const result = await locator.locate('/foo/bar.js');

    assert.deepStrictEqual(result, Maybe.nothing());
    assert.strictEqual(checkReadability.callCount, 0);
});

test('returns nothing when the sourceMappingURL comment does not contain a file name', async () => {
    const readFile = fake.resolves('foo\n//# sourceMappingURL=');
    const checkReadability = fake.resolves({ isReadable: true });
    const locator = sourceMapFileLocatorFactory({ readFile, checkReadability });

    const result = await locator.locate('/foo/bar.js');

    assert.deepStrictEqual(result, Maybe.nothing());
    assert.strictEqual(checkReadability.callCount, 0);
});

test('reads the named capture group value as the source map file name', async () => {
    const readFile = fake.resolves('foo\n//# sourceMappingURL=../maps/baz.map.js');
    const checkReadability = fake.resolves({ isReadable: false });
    const locator = sourceMapFileLocatorFactory({ readFile, checkReadability });

    const result = await locator.locate('/foo/bar.js');

    assert.deepStrictEqual(result, Maybe.nothing());
    assert.deepStrictEqual(checkReadability.firstCall.args, ['/maps/baz.map.js']);
});

test('uses the full sourceMappingURL capture up to the end of the line', async () => {
    const readFile = fake.resolves('foo\n//# sourceMappingURL=../maps/baz.map.js?hash=1');
    const checkReadability = fake.resolves({ isReadable: false });
    const locator = sourceMapFileLocatorFactory({ readFile, checkReadability });

    await locator.locate('/foo/bar.js');

    assert.deepStrictEqual(checkReadability.firstCall.args, ['/maps/baz.map.js?hash=1']);
});

test('checks if the referenced source mapping file is readable on the file system', async () => {
    const readFile = fake.resolves('foo\n//# sourceMappingURL=baz.map.js');
    const checkReadability = fake.resolves({ isReadable: false });
    const locator = sourceMapFileLocatorFactory({ readFile, checkReadability });

    await locator.locate('/foo/bar.js');

    assert.strictEqual(checkReadability.callCount, 1);
    assert.deepStrictEqual(checkReadability.firstCall.args, ['/foo/baz.map.js']);
});

test('returns the path to the referenced source map file when it is readable', async () => {
    const readFile = fake.resolves('foo\n//# sourceMappingURL=../maps/baz.map.js');
    const checkReadability = fake.resolves({ isReadable: true });
    const locator = sourceMapFileLocatorFactory({ readFile, checkReadability });

    const result = await locator.locate('/foo/bar.js');

    assert.deepStrictEqual(result, Maybe.just('/maps/baz.map.js'));
});

test('returns nothing when there is an external source mapping file referenced but it can’t be read', async () => {
    const readFile = fake.resolves('foo\n//# sourceMappingURL=baz.map.js');
    const checkReadability = fake.resolves({ isReadable: false });
    const locator = sourceMapFileLocatorFactory({ readFile, checkReadability });

    const result = await locator.locate('/foo/bar.js');

    assert.deepStrictEqual(result, Maybe.nothing());
});
