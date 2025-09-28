import test from 'ava';
import { fake, type SinonSpy } from 'sinon';
import type { LinkedBundleResource } from '../linker/linked-bundle.ts';
import {
    type ArtifactsBuilder,
    type ArtifactsBuilderDependencies,
    createArtifactsBuilder
} from './artifacts-builder.ts';

type Overrides = {
    readonly readFile?: SinonSpy;
    readonly checkReadability?: SinonSpy;
    readonly copyFile?: SinonSpy;
    readonly writeFile?: SinonSpy;
    readonly getFileMode?: SinonSpy;
    readonly tarballBuilder?: { readonly build?: SinonSpy };
};

// eslint-disable-next-line complexity -- needs to be refactored
function artifactsBuilderFactory(overrides: Overrides = {}): ArtifactsBuilder {
    const {
        readFile = fake(),
        checkReadability = fake(),
        copyFile = fake(),
        writeFile = fake(),
        getFileMode = fake.resolves(-1),
        tarballBuilder: { build = fake.resolves(Buffer.from([-1])) } = {}
    } = overrides;
    const fakeDependencies = {
        fileManager: { readFile, checkReadability, copyFile, writeFile, getFileMode },
        tarballBuilder: { build }
    } as unknown as ArtifactsBuilderDependencies;
    return createArtifactsBuilder(fakeDependencies);
}

test('buildTarball() returns the tarData and its shasum', async (t) => {
    const tarballBuilder = { build: fake.resolves(Buffer.from([42])) };
    const builder = artifactsBuilderFactory({ tarballBuilder });
    const result = await builder.buildTarball({
        contents: [],
        packageJson: { name: 'the-name', version: 'the-version' },
        name: 'the-name',
        version: '',
        dependencies: {},
        peerDependencies: {},
        additionalAttributes: {},
        mainFile: { content: '', isExecutable: false, sourceFilePath: '', targetFilePath: '' },
        packageType: 'module',
        manifestFile: { content: '', isExecutable: false, filePath: '' }
    });

    t.deepEqual(result, {
        tarData: Buffer.from([42]),
        shasum: 'df58248c414f342c81e056b40bee12d17a08bf61'
    });
});

test('buildTarball() passes all given contents to the tarballBuilder', async (t) => {
    const tarballBuilder = { build: fake.resolves(Buffer.from([])) };
    const builder = artifactsBuilderFactory({ tarballBuilder });
    const contents: LinkedBundleResource[] = [
        {
            isSubstituted: false,
            directDependencies: new Set(),
            fileDescription: {
                content: 'bar',
                isExecutable: false,
                sourceFilePath: '/foo/bar.txt',
                targetFilePath: 'bar.txt'
            }
        },
        {
            isSubstituted: false,
            directDependencies: new Set(),
            fileDescription: {
                content: 'baz',
                isExecutable: false,
                sourceFilePath: '/foo/bar.txt',
                targetFilePath: 'baz.txt'
            }
        },
        {
            isSubstituted: true,
            directDependencies: new Set(),
            fileDescription: {
                content: 'qux',
                isExecutable: false,
                sourceFilePath: '/foo/bar.txt',
                targetFilePath: 'qux.txt'
            }
        }
    ];
    await builder.buildTarball({
        contents,
        packageJson: { name: 'the-name', version: 'the-version' },
        name: 'the-name',
        version: '',
        dependencies: {},
        peerDependencies: {},
        additionalAttributes: {},
        mainFile: { content: '', isExecutable: false, sourceFilePath: '', targetFilePath: '' },
        packageType: 'module',
        manifestFile: { content: '{}', isExecutable: false, filePath: 'package.json' }
    });

    t.is(tarballBuilder.build.callCount, 1);
    t.deepEqual(tarballBuilder.build.firstCall.args, [
        [
            { filePath: 'package/package.json', content: '{}', isExecutable: false },
            { filePath: 'package/bar.txt', content: 'bar', isExecutable: false },
            { filePath: 'package/baz.txt', content: 'baz', isExecutable: false },
            { filePath: 'package/qux.txt', content: 'qux', isExecutable: false }
        ]
    ]);
});

test('buildFolder() writes only the manifest when the given bundle has no contents', async (t) => {
    const writeFile = fake.resolves(undefined);
    const checkReadability = fake.resolves({ isReadable: false });
    const builder = artifactsBuilderFactory({ writeFile, checkReadability });

    await builder.buildFolder(
        {
            contents: [],
            packageJson: { name: 'the-name', version: 'the-version' },
            name: '',
            version: '',
            dependencies: {},
            peerDependencies: {},
            additionalAttributes: {},
            mainFile: { content: '', isExecutable: false, sourceFilePath: '', targetFilePath: '' },
            packageType: 'module',
            manifestFile: { content: '{}', isExecutable: false, filePath: 'package.json' }
        },
        '/the/target/folder'
    );

    t.is(writeFile.callCount, 1);
    t.deepEqual(writeFile.firstCall.args, ['/the/target/folder/package.json', '{}']);
});

test('buildFolder() throws when the target folder already exists', async (t) => {
    const checkReadability = fake.resolves({ isReadable: true });
    const builder = artifactsBuilderFactory({ checkReadability });

    try {
        await builder.buildFolder(
            {
                contents: [],
                packageJson: { name: 'the-name', version: 'the-version' },
                name: '',
                version: '',
                dependencies: {},
                peerDependencies: {},
                additionalAttributes: {},
                mainFile: { content: '', isExecutable: false, sourceFilePath: '', targetFilePath: '' },
                packageType: 'module',
                manifestFile: { content: '', isExecutable: false, filePath: '' }
            },
            '/the/target/folder'
        );
        t.fail('Expected buildFolder() to throw but it did not');
    } catch (error: unknown) {
        t.is(checkReadability.callCount, 1);
        t.deepEqual(checkReadability.firstCall.args, ['/the/target/folder']);
        t.is((error as Error).message, 'Folder /the/target/folder already exists');
    }
});

test('buildFolder() writes the source of a source bundle content to the given target folder', async (t) => {
    const writeFile = fake.resolves(undefined);
    const checkReadability = fake.resolves({ isReadable: false });
    const builder = artifactsBuilderFactory({ writeFile, checkReadability });
    const contents: LinkedBundleResource[] = [
        {
            isSubstituted: false,
            directDependencies: new Set(),
            fileDescription: {
                content: 'the-content',
                isExecutable: false,
                sourceFilePath: '/foo/bar.txt',
                targetFilePath: 'bar/baz.txt'
            }
        }
    ];
    await builder.buildFolder(
        {
            contents,
            packageJson: { name: 'the-name', version: 'the-version' },
            name: '',
            version: '',
            dependencies: {},
            peerDependencies: {},
            additionalAttributes: {},
            mainFile: { content: '', isExecutable: false, sourceFilePath: '', targetFilePath: '' },
            packageType: 'module',
            manifestFile: { content: '{}', isExecutable: false, filePath: 'package.json' }
        },
        '/the/target/folder'
    );

    t.is(writeFile.callCount, 2);
    t.deepEqual(writeFile.firstCall.args, ['/the/target/folder/package.json', '{}']);
    t.deepEqual(writeFile.secondCall.args, ['/the/target/folder/bar/baz.txt', 'the-content']);
});

test('collectContents() returns the list of file descriptions of the given bundle', (t) => {
    const readFile = fake.resolves('bar');
    const builder = artifactsBuilderFactory({ readFile });
    const contents: LinkedBundleResource[] = [
        {
            isSubstituted: false,
            directDependencies: new Set(),
            fileDescription: {
                content: 'bar',
                isExecutable: false,
                sourceFilePath: '/foo/bar.txt',
                targetFilePath: 'bar.txt'
            }
        },
        {
            isSubstituted: false,
            directDependencies: new Set(),
            fileDescription: {
                content: 'baz',
                isExecutable: false,
                sourceFilePath: '/foo/bar.txt',
                targetFilePath: 'baz.txt'
            }
        },
        {
            isSubstituted: true,
            directDependencies: new Set(),
            fileDescription: {
                content: 'qux',
                isExecutable: false,
                sourceFilePath: '/foo/bar.txt',
                targetFilePath: 'qux.txt'
            }
        }
    ];
    const result = builder.collectContents({
        contents,
        packageJson: { name: 'the-name', version: 'the-version' },
        name: '',
        version: '',
        dependencies: {},
        peerDependencies: {},
        additionalAttributes: {},
        mainFile: { content: '', isExecutable: false, sourceFilePath: '', targetFilePath: '' },
        packageType: 'module',
        manifestFile: { content: '{}', isExecutable: false, filePath: 'package.json' }
    });

    t.deepEqual(result, [
        { filePath: 'package.json', content: '{}', isExecutable: false },
        { filePath: 'bar.txt', content: 'bar', isExecutable: false },
        { filePath: 'baz.txt', content: 'baz', isExecutable: false },
        { filePath: 'qux.txt', content: 'qux', isExecutable: false }
    ]);
});
