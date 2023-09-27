import test from 'ava';
import { fake, type SinonSpy } from 'sinon';
import { extractTarEntries } from '../test-libraries/tar.js';
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
};

function artifactsBuilderFactory(overrides: Overrides = {}): ArtifactsBuilder {
    const { readFile = fake(), checkReadability = fake(), copyFile = fake(), writeFile = fake() } = overrides;
    const fakeDependencies = {
        fileManager: { readFile, checkReadability, copyFile, writeFile }
    } as unknown as ArtifactsBuilderDependencies;
    return createArtifactsBuilder(fakeDependencies);
}

test('buildTarball() creates an empty tarball when the given bundle has no contents', async (t) => {
    const builder = artifactsBuilderFactory();
    const result = await builder.buildTarball({
        contents: [],
        packageJson: { name: 'the-name', version: 'the-version' }
    });
    const entries = await extractTarEntries(result.tarData);

    t.deepEqual(entries, []);
    t.is(result.shasum, '362913d4c1f5f1db9ccb9d7cccc4e12b89c62c5f');
});

test('buildTarball() creates a tarball with all different kinds of bundle contents', async (t) => {
    const readFile = fake.resolves('bar');
    const builder = artifactsBuilderFactory({ readFile });
    const contents: BundleContent[] = [
        { kind: 'reference', sourceFilePath: '/foo/bar.txt', targetFilePath: 'bar.txt' },
        { kind: 'source', targetFilePath: 'baz.txt', source: 'baz' },
        { kind: 'substituted', sourceFilePath: '/foo/qux.txt', targetFilePath: 'qux.txt', source: 'qux' }
    ];
    const result = await builder.buildTarball({ contents, packageJson: { name: 'the-name', version: 'the-version' } });
    const entries = await extractTarEntries(result.tarData);

    t.is(readFile.callCount, 1);
    t.deepEqual(readFile.firstCall.args, ['/foo/bar.txt']);
    t.deepEqual(entries, [
        {
            content: 'bar',
            header: {
                devmajor: 0,
                devminor: 0,
                gid: 0,
                gname: '',
                linkname: null,
                mode: 420,
                mtime: new Date(0),
                name: 'package/bar.txt',
                pax: null,
                size: 3,
                type: 'file',
                uid: 0,
                uname: ''
            }
        },
        {
            content: 'baz',
            header: {
                devmajor: 0,
                devminor: 0,
                gid: 0,
                gname: '',
                linkname: null,
                mode: 420,
                mtime: new Date(0),
                name: 'package/baz.txt',
                pax: null,
                size: 3,
                type: 'file',
                uid: 0,
                uname: ''
            }
        },
        {
            content: 'qux',
            header: {
                devmajor: 0,
                devminor: 0,
                gid: 0,
                gname: '',
                linkname: null,
                mode: 420,
                mtime: new Date(0),
                name: 'package/qux.txt',
                pax: null,
                size: 3,
                type: 'file',
                uid: 0,
                uname: ''
            }
        }
    ]);

    t.is(result.shasum, 'ada9bbb1318dd4808fbcbb8c874d07459aff577d');
});

test('buildTarball() ensures to build the exact same tarball with the same checksum when building two tarballs with the same file added in a different order', async (t) => {
    const builder = artifactsBuilderFactory();
    const firstTarball = await builder.buildTarball({
        contents: [
            { kind: 'source', targetFilePath: 'first.txt', source: '1' },
            { kind: 'source', targetFilePath: 'second.txt', source: '2' }
        ],
        packageJson: { name: 'the-name', version: 'the-version' }
    });
    const secondTarball = await builder.buildTarball({
        contents: [
            { kind: 'source', targetFilePath: 'second.txt', source: '2' },
            { kind: 'source', targetFilePath: 'first.txt', source: '1' }
        ],
        packageJson: { name: 'the-name', version: 'the-version' }
    });

    t.is(firstTarball.shasum, 'e8a6d0780788b78daab58294c9adb474c0b150b3');
    t.is(secondTarball.shasum, 'e8a6d0780788b78daab58294c9adb474c0b150b3');
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
