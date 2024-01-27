import test from 'ava';
import { fake, type SinonSpy } from 'sinon';
import type { BundleContent } from '../bundler/bundle-description.js';
import {
    type ArtifactsBuilder,
    type ArtifactsBuilderDependencies,
    createArtifactsBuilder
} from './artifacts-builder.js';

type Overrides = {
    readonly readFile?: SinonSpy;
    readonly checkReadability?: SinonSpy;
    readonly copyFile?: SinonSpy;
    readonly writeFile?: SinonSpy;
    readonly tarballBuilder?: { readonly build?: SinonSpy };
};

function artifactsBuilderFactory(overrides: Overrides = {}): ArtifactsBuilder {
    const {
        readFile = fake(),
        checkReadability = fake(),
        copyFile = fake(),
        writeFile = fake(),
        tarballBuilder: { build = fake.resolves(Buffer.from([-1])) } = {}
    } = overrides;
    const fakeDependencies = {
        fileManager: { readFile, checkReadability, copyFile, writeFile },
        tarballBuilder: { build }
    } as unknown as ArtifactsBuilderDependencies;
    return createArtifactsBuilder(fakeDependencies);
}

test('buildTarball() returns the tarData and its shasum', async (t) => {
    const tarballBuilder = { build: fake.resolves(Buffer.from([42])) };
    const builder = artifactsBuilderFactory({ tarballBuilder });
    const result = await builder.buildTarball({
        contents: [],
        packageJson: { name: 'the-name', version: 'the-version' }
    });

    t.deepEqual(result, {
        tarData: Buffer.from([42]),
        shasum: 'df58248c414f342c81e056b40bee12d17a08bf61'
    });
});

test('buildTarball() passes all given contents to the tarballBuilder', async (t) => {
    const tarballBuilder = { build: fake.resolves(Buffer.from([])) };
    const readFile = fake.resolves('bar');
    const builder = artifactsBuilderFactory({ readFile, tarballBuilder });
    const contents: BundleContent[] = [
        { kind: 'reference', sourceFilePath: '/foo/bar.txt', targetFilePath: 'bar.txt' },
        { kind: 'source', targetFilePath: 'baz.txt', source: 'baz' },
        { kind: 'substituted', sourceFilePath: '/foo/qux.txt', targetFilePath: 'qux.txt', source: 'qux' }
    ];
    await builder.buildTarball({ contents, packageJson: { name: 'the-name', version: 'the-version' } });

    t.is(readFile.callCount, 1);
    t.deepEqual(readFile.firstCall.args, ['/foo/bar.txt']);
    t.is(tarballBuilder.build.callCount, 1);
    t.deepEqual(tarballBuilder.build.firstCall.args, [
        [
            { filePath: 'package/bar.txt', content: 'bar' },
            { filePath: 'package/baz.txt', content: 'baz' },
            { filePath: 'package/qux.txt', content: 'qux' }
        ]
    ]);
});

test('buildFolder() doesn’t write or copy anything when the given bundle has no contents', async (t) => {
    const writeFile = fake.resolves(undefined);
    const copyFile = fake.resolves(undefined);
    const checkReadability = fake.resolves({ isReadable: false });
    const builder = artifactsBuilderFactory({ writeFile, copyFile, checkReadability });

    await builder.buildFolder(
        { contents: [], packageJson: { name: 'the-name', version: 'the-version' } },
        '/the/target/folder'
    );

    t.is(writeFile.callCount, 0);
    t.is(copyFile.callCount, 0);
});

test('buildFolder() throws when the target folder already exists', async (t) => {
    const checkReadability = fake.resolves({ isReadable: true });
    const builder = artifactsBuilderFactory({ checkReadability });

    try {
        await builder.buildFolder(
            { contents: [], packageJson: { name: 'the-name', version: 'the-version' } },
            '/the/target/folder'
        );
        t.fail('Expected buildFolder() to throw but it did not');
    } catch (error: unknown) {
        t.is(checkReadability.callCount, 1);
        t.deepEqual(checkReadability.firstCall.args, ['/the/target/folder']);
        t.is((error as Error).message, 'Folder /the/target/folder already exists');
    }
});

test('buildFolder() copies a reference bundle content to the given target folder', async (t) => {
    const copyFile = fake.resolves(undefined);
    const checkReadability = fake.resolves({ isReadable: false });
    const builder = artifactsBuilderFactory({ copyFile, checkReadability });
    const contents: BundleContent[] = [
        { kind: 'reference', sourceFilePath: '/foo/bar/baz.txt', targetFilePath: 'bar/baz.txt' }
    ];
    await builder.buildFolder(
        { contents, packageJson: { name: 'the-name', version: 'the-version' } },
        '/the/target/folder'
    );

    t.is(copyFile.callCount, 1);
    t.deepEqual(copyFile.firstCall.args, ['/foo/bar/baz.txt', '/the/target/folder/bar/baz.txt']);
});

test('buildFolder() writes the source of a source bundle content to the given target folder', async (t) => {
    const writeFile = fake.resolves(undefined);
    const checkReadability = fake.resolves({ isReadable: false });
    const builder = artifactsBuilderFactory({ writeFile, checkReadability });
    const contents: BundleContent[] = [{ kind: 'source', targetFilePath: 'bar/baz.txt', source: 'the-content' }];
    await builder.buildFolder(
        { contents, packageJson: { name: 'the-name', version: 'the-version' } },
        '/the/target/folder'
    );

    t.is(writeFile.callCount, 1);
    t.deepEqual(writeFile.firstCall.args, ['/the/target/folder/bar/baz.txt', 'the-content']);
});

test('buildFolder() writes the source of a substituted bundle content to the given target folder', async (t) => {
    const writeFile = fake.resolves(undefined);
    const checkReadability = fake.resolves({ isReadable: false });
    const builder = artifactsBuilderFactory({ writeFile, checkReadability });
    const contents: BundleContent[] = [
        {
            kind: 'substituted',
            sourceFilePath: '/foo/bar/bax.txt',
            targetFilePath: 'bar/baz.txt',
            source: 'the-content'
        }
    ];
    await builder.buildFolder(
        { contents, packageJson: { name: 'the-name', version: 'the-version' } },
        '/the/target/folder'
    );

    t.is(writeFile.callCount, 1);
    t.deepEqual(writeFile.firstCall.args, ['/the/target/folder/bar/baz.txt', 'the-content']);
});

test('collectContents() returns the list of file descriptions of the given bundle', async (t) => {
    const readFile = fake.resolves('bar');
    const builder = artifactsBuilderFactory({ readFile });
    const contents: BundleContent[] = [
        { kind: 'reference', sourceFilePath: '/foo/bar.txt', targetFilePath: 'bar.txt' },
        { kind: 'source', targetFilePath: 'baz.txt', source: 'baz' },
        { kind: 'substituted', sourceFilePath: '/foo/qux.txt', targetFilePath: 'qux.txt', source: 'qux' }
    ];
    const result = await builder.collectContents({
        contents,
        packageJson: { name: 'the-name', version: 'the-version' }
    });

    t.deepEqual(result, [
        { filePath: 'package/bar.txt', content: 'bar' },
        { filePath: 'package/baz.txt', content: 'baz' },
        { filePath: 'package/qux.txt', content: 'qux' }
    ]);
});
