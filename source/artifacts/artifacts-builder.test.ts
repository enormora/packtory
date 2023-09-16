import test from 'node:test';
import assert from 'node:assert';
import {fake, SinonSpy} from 'sinon';
import {ArtifactsBuilder, ArtifactsBuilderDependencies, createArtifactsBuilder} from './artifacts-builder.js';
import {extractTarEntries} from '../test-libraries/tar.js';
import {BundleContent} from '../bundler/bundle-description.js';

interface Overrides {
    readFile?: SinonSpy;
    checkReadability?: SinonSpy;
    copyFile?: SinonSpy;
    writeFile?: SinonSpy;
}

function artifactsBuilderFactory(overrides: Overrides = {}): ArtifactsBuilder {
    const {readFile = fake(), checkReadability = fake(), copyFile = fake(), writeFile = fake()} = overrides;
    const fakeDependencies = {fileManager: {readFile, checkReadability, copyFile, writeFile}} as unknown as ArtifactsBuilderDependencies
    return createArtifactsBuilder(fakeDependencies);
}

test('buildTarball() creates an empty tarball when the given bundle has no contents', async () => {
    const builder = artifactsBuilderFactory();
    const result = await builder.buildTarball({contents: [], packageJson: {name: 'the-name', version: 'the-version'}});
    const entries = await extractTarEntries(result.tarData);

    assert.deepStrictEqual(entries, []);
    assert.strictEqual(result.shasum, 'c87d7ae654b3c62ea785fb594ad9fd3af4bb75ca');
});

test('buildTarball() creates a tarball with all different kinds of bundle contents', async () => {
    const readFile = fake.resolves('bar');
    const builder = artifactsBuilderFactory({readFile});
    const contents: BundleContent[] = [
        {kind: 'reference', sourceFilePath: '/foo/bar.txt', targetFilePath: 'bar.txt'},
        {kind: 'source', targetFilePath: 'baz.txt', source: 'baz'},
        {kind: 'substituted', sourceFilePath: '/foo/qux.txt', targetFilePath: 'qux.txt', source: 'qux'},
    ];
    const result = await builder.buildTarball({contents, packageJson: {name: 'the-name', version: 'the-version'}});
    const entries = await extractTarEntries(result.tarData);

    assert.strictEqual(readFile.callCount, 1);
    assert.deepStrictEqual(readFile.firstCall.args, [ '/foo/bar.txt' ]);
    assert.deepStrictEqual(entries, [
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
        } ]);

    assert.strictEqual(result.shasum, '0616a68ee86b060ced9a3e72e88a756e66ccde39');
});

test('buildTarball() ensures to build the exact same tarball with the same checksum when building two tarballs with the same file added in a different order', async () => {
    const builder = artifactsBuilderFactory();
    const firstTarball = await builder.buildTarball({
        contents: [
            {kind: 'source', targetFilePath: 'first.txt', source: '1'},
            {kind: 'source', targetFilePath: 'second.txt', source: '2'},
        ], packageJson: {name: 'the-name', version: 'the-version'}
    });
    const secondTarball = await builder.buildTarball({
        contents: [
            {kind: 'source', targetFilePath: 'second.txt', source: '2'},
            {kind: 'source', targetFilePath: 'first.txt', source: '1'},
        ], packageJson: {name: 'the-name', version: 'the-version'}
    });

    assert.strictEqual(firstTarball.shasum, '686d20fcc7161516e691e3c447e8b72d54be3170');
    assert.strictEqual(secondTarball.shasum, '686d20fcc7161516e691e3c447e8b72d54be3170');
});

test('buildFolder() doesn’t write or copy anything when the given bundle has no contents', async () => {
    const writeFile = fake.resolves(undefined);
    const copyFile = fake.resolves(undefined);
    const checkReadability = fake.resolves({isReadable: false})
    const builder = artifactsBuilderFactory({writeFile, copyFile, checkReadability});

    await builder.buildFolder({contents: [], packageJson: {name: 'the-name', version: 'the-version'}}, '/the/target/folder');

    assert.strictEqual(writeFile.callCount, 0);
    assert.strictEqual(copyFile.callCount, 0);
});

test('buildFolder() throws when the target folder already exists', async () => {
    const checkReadability = fake.resolves({isReadable: true})
    const builder = artifactsBuilderFactory({checkReadability});

    try {
        await builder.buildFolder({contents: [], packageJson: {name: 'the-name', version: 'the-version'}}, '/the/target/folder');
        assert.fail('Expected buildFolder() to thorw but it did not');
    } catch (error: unknown) {
        assert.strictEqual(checkReadability.callCount, 1);
        assert.deepStrictEqual(checkReadability.firstCall.args, [ '/the/target/folder' ]);
        assert.strictEqual((error as Error).message, 'Folder /the/target/folder already exists');
    }
});

test('buildFolder() copies a reference bundle content to the given target folder', async () => {
    const copyFile = fake.resolves(undefined);
    const checkReadability = fake.resolves({isReadable: false})
    const builder = artifactsBuilderFactory({copyFile, checkReadability});
    const contents: BundleContent[] = [
        {kind: 'reference', sourceFilePath: '/foo/bar/baz.txt', targetFilePath: 'bar/baz.txt'},
    ];
    await builder.buildFolder({contents, packageJson: {name: 'the-name', version: 'the-version'}}, '/the/target/folder');

    assert.strictEqual(copyFile.callCount, 1);
    assert.deepStrictEqual(copyFile.firstCall.args, [ '/foo/bar/baz.txt', '/the/target/folder/bar/baz.txt' ]);
});

test('buildFolder() writes the source of a source bundle content to the given target folder', async () => {
    const writeFile = fake.resolves(undefined);
    const checkReadability = fake.resolves({isReadable: false})
    const builder = artifactsBuilderFactory({writeFile, checkReadability});
    const contents: BundleContent[] = [
        {kind: 'source', targetFilePath: 'bar/baz.txt', source: 'the-content'},
    ];
    await builder.buildFolder({contents, packageJson: {name: 'the-name', version: 'the-version'}}, '/the/target/folder');

    assert.strictEqual(writeFile.callCount, 1);
    assert.deepStrictEqual(writeFile.firstCall.args, [ '/the/target/folder/bar/baz.txt', 'the-content' ]);
});

test('buildFolder() writes the source of a substituted bundle content to the given target folder', async () => {
    const writeFile = fake.resolves(undefined);
    const checkReadability = fake.resolves({isReadable: false})
    const builder = artifactsBuilderFactory({writeFile, checkReadability});
    const contents: BundleContent[] = [
        {kind: 'substituted', sourceFilePath: '/foo/bar/bax.txt', targetFilePath: 'bar/baz.txt', source: 'the-content'},
    ];
    await builder.buildFolder({contents, packageJson: {name: 'the-name', version: 'the-version'}}, '/the/target/folder');

    assert.strictEqual(writeFile.callCount, 1);
    assert.deepStrictEqual(writeFile.firstCall.args, [ '/the/target/folder/bar/baz.txt', 'the-content' ]);
});

