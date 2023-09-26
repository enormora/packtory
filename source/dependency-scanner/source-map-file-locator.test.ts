import test from "ava"
import {
    createSourceMapFileLocator,
    SourceMapFileLocator,
    SourceMapFileLocatorDependencies,
} from './source-map-file-locator.js';
import { fake, SinonSpy } from 'sinon';
import { Maybe } from 'true-myth';

interface Overrides {
    readonly readFile?: SinonSpy;
    readonly checkReadability?: SinonSpy;
}

function sourceMapFileLocatorFactory(overrides: Overrides = {}): SourceMapFileLocator {
    const { readFile = fake.resolves(''), checkReadability = fake.resolves(null) } = overrides;
    const fakeDependencies = {
        fileManager: {
            readFile,
            checkReadability,
        },
    } as unknown as SourceMapFileLocatorDependencies;

    return createSourceMapFileLocator(fakeDependencies);
}

test('reads the content of the given source file', async (t) => {
    const readFile = fake.resolves('');
    const locator = sourceMapFileLocatorFactory({ readFile });

    await locator.locate('/foo/bar.js');

    t.is(readFile.callCount, 1);
    t.deepEqual(readFile.firstCall.args, ['/foo/bar.js']);
});

test('returns nothing when there is no external source mapping URL referenced in the given file', async (t) => {
    const readFile = fake.resolves('no sourceMappingURL comment');
    const locator = sourceMapFileLocatorFactory({ readFile });

    const result = await locator.locate('/foo/bar.js');

    t.deepEqual(result, Maybe.nothing());
});

test('checks if the referenced source mapping file is readable on the file system', async (t) => {
    const readFile = fake.resolves('foo\n//# sourceMappingURL=baz.map.js');
    const checkReadability = fake.resolves({ isReadable: false });
    const locator = sourceMapFileLocatorFactory({ readFile, checkReadability });

    await locator.locate('/foo/bar.js');

    t.is(checkReadability.callCount, 1);
    t.deepEqual(checkReadability.firstCall.args, ['/foo/baz.map.js']);
});

test('returns the path to the referenced source map file when it is readable', async (t) => {
    const readFile = fake.resolves('foo\n//# sourceMappingURL=baz.map.js');
    const checkReadability = fake.resolves({ isReadable: true });
    const locator = sourceMapFileLocatorFactory({ readFile, checkReadability });

    const result = await locator.locate('/foo/bar.js');

    t.deepEqual(result, Maybe.just('/foo/baz.map.js'));
});

test('returns nothing when there is an external source mapping file referenced but it can’t be read', async (t) => {
    const readFile = fake.resolves('foo\n//# sourceMappingURL=baz.map.js');
    const checkReadability = fake.resolves({ isReadable: false });
    const locator = sourceMapFileLocatorFactory({ readFile, checkReadability });

    const result = await locator.locate('/foo/bar.js');

    t.deepEqual(result, Maybe.nothing());
});
