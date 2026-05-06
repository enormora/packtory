import assert from 'node:assert';
import { test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import type { LinkedBundleResource } from '../linker/linked-bundle.ts';
import { versionedBundleWithManifest } from '../test-libraries/bundle-fixtures.ts';
import {
    type ArtifactsBuilder,
    type ArtifactsBuilderDependencies,
    createArtifactsBuilder
} from './artifacts-builder.ts';

function bundleWithContents(
    contents: readonly LinkedBundleResource[],
    manifestFilePath = ''
): ReturnType<typeof versionedBundleWithManifest> {
    return versionedBundleWithManifest({
        contents,
        packageJson: { name: 'the-name', version: 'the-version' },
        name: manifestFilePath === '' ? '' : 'the-name',
        manifestFile: { content: manifestFilePath === '' ? '' : '{}', isExecutable: false, filePath: manifestFilePath }
    });
}

type Overrides = {
    readonly readFile?: SinonSpy;
    readonly checkReadability?: SinonSpy;
    readonly copyFile?: SinonSpy;
    readonly writeFile?: SinonSpy;
    readonly getFileMode?: SinonSpy;
    readonly tarballBuilder?: { readonly build?: SinonSpy };
};

function createSpy<TSpy extends SinonSpy>(spy: TSpy | undefined, fallback: () => TSpy): TSpy {
    return spy ?? fallback();
}

function createTarballBuilderDependencies(overrides: Overrides['tarballBuilder'] = {}): {
    readonly build: SinonSpy;
} {
    return {
        build: createSpy(overrides.build, () => {
            return fake.resolves(Buffer.from([-1]));
        })
    };
}

function artifactsBuilderFactory(overrides: Overrides = {}): ArtifactsBuilder {
    const dependencies: ArtifactsBuilderDependencies = {
        fileManager: {
            readFile: createSpy(overrides.readFile, fake),
            checkReadability: createSpy(overrides.checkReadability, fake),
            copyFile: createSpy(overrides.copyFile, fake),
            writeFile: createSpy(overrides.writeFile, fake),
            getFileMode: createSpy(overrides.getFileMode, () => {
                return fake.resolves(-1);
            }),
            getTransferableFileDescriptionFromPath: fake()
        },
        tarballBuilder: createTarballBuilderDependencies(overrides.tarballBuilder)
    };

    return createArtifactsBuilder(dependencies);
}

function makeContent(targetFilePath: string, content: string, isSubstituted = false): LinkedBundleResource {
    return {
        isSubstituted,
        isExplicitlyIncluded: false,
        directDependencies: new Set(),
        fileDescription: {
            content,
            isExecutable: false,
            sourceFilePath: '/foo/bar.txt',
            targetFilePath
        }
    };
}

test('buildTarball() returns the tarData and its shasum', async () => {
    const tarballBuilder = { build: fake.resolves(Buffer.from([42])) };
    const builder = artifactsBuilderFactory({ tarballBuilder });
    const result = await builder.buildTarball(bundleWithContents([]));

    assert.deepStrictEqual(result, {
        tarData: Buffer.from([42]),
        shasum: 'df58248c414f342c81e056b40bee12d17a08bf61'
    });
});

test('buildTarball() passes all given contents to the tarballBuilder', async () => {
    const tarballBuilder = { build: fake.resolves(Buffer.from([])) };
    const builder = artifactsBuilderFactory({ tarballBuilder });
    const contents: LinkedBundleResource[] = [
        makeContent('bar.txt', 'bar'),
        makeContent('baz.txt', 'baz'),
        makeContent('qux.txt', 'qux', true)
    ];
    await builder.buildTarball(bundleWithContents(contents, 'package.json'));

    assert.strictEqual(tarballBuilder.build.callCount, 1);
    assert.deepStrictEqual(tarballBuilder.build.firstCall.args, [
        [
            { filePath: 'package/package.json', content: '{}', isExecutable: false },
            { filePath: 'package/bar.txt', content: 'bar', isExecutable: false },
            { filePath: 'package/baz.txt', content: 'baz', isExecutable: false },
            { filePath: 'package/qux.txt', content: 'qux', isExecutable: false }
        ]
    ]);
});

test('buildFolder() writes only the manifest when the given bundle has no contents', async () => {
    const writeFile = fake.resolves(undefined);
    const checkReadability = fake.resolves({ isReadable: false });
    const builder = artifactsBuilderFactory({ writeFile, checkReadability });

    await builder.buildFolder(bundleWithContents([], 'package.json'), '/the/target/folder');

    assert.strictEqual(writeFile.callCount, 1);
    assert.deepStrictEqual(writeFile.firstCall.args, ['/the/target/folder/package.json', '{}']);
});

test('buildFolder() throws when the target folder already exists', async () => {
    const checkReadability = fake.resolves({ isReadable: true });
    const builder = artifactsBuilderFactory({ checkReadability });

    try {
        await builder.buildFolder(bundleWithContents([]), '/the/target/folder');
        assert.fail('Expected buildFolder() to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual(checkReadability.callCount, 1);
        assert.deepStrictEqual(checkReadability.firstCall.args, ['/the/target/folder']);
        assert.strictEqual((error as Error).message, 'Folder /the/target/folder already exists');
    }
});

test('buildFolder() writes the source of a source bundle content to the given target folder', async () => {
    const writeFile = fake.resolves(undefined);
    const checkReadability = fake.resolves({ isReadable: false });
    const builder = artifactsBuilderFactory({ writeFile, checkReadability });
    const contents: LinkedBundleResource[] = [makeContent('bar/baz.txt', 'the-content')];
    await builder.buildFolder(bundleWithContents(contents, 'package.json'), '/the/target/folder');

    assert.strictEqual(writeFile.callCount, 2);
    assert.deepStrictEqual(writeFile.firstCall.args, ['/the/target/folder/package.json', '{}']);
    assert.deepStrictEqual(writeFile.secondCall.args, ['/the/target/folder/bar/baz.txt', 'the-content']);
});

test('collectContents() returns the list of file descriptions of the given bundle', () => {
    const readFile = fake.resolves('bar');
    const builder = artifactsBuilderFactory({ readFile });
    const contents: LinkedBundleResource[] = [
        makeContent('bar.txt', 'bar'),
        makeContent('baz.txt', 'baz'),
        makeContent('qux.txt', 'qux', true)
    ];
    const result = builder.collectContents(bundleWithContents(contents, 'package.json'));

    assert.deepStrictEqual(result, [
        { filePath: 'package.json', content: '{}', isExecutable: false },
        { filePath: 'bar.txt', content: 'bar', isExecutable: false },
        { filePath: 'baz.txt', content: 'baz', isExecutable: false },
        { filePath: 'qux.txt', content: 'qux', isExecutable: false }
    ]);
});
