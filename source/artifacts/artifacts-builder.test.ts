import assert from 'node:assert';
import { test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import type { AnalyzedBundleResource } from '../dead-code-eliminator/analyzed-bundle.ts';
import { createProgressBroadcaster } from '../progress/progress-broadcaster.ts';
import { createSpyingBroadcaster } from '../test-libraries/result-helpers.ts';
import { versionedBundleWithManifest } from '../test-libraries/bundle-fixtures.ts';
import { createFakeFileManager, type FakeFileManager } from '../test-libraries/fake-file-manager.ts';
import {
    type ArtifactsBuilder,
    type ArtifactsBuilderDependencies,
    createArtifactsBuilder
} from './artifacts-builder.ts';

function bundleWithContents(
    contents: readonly AnalyzedBundleResource[],
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
    readonly fileManager?: FakeFileManager;
    readonly tarballBuilder?: { readonly build?: SinonSpy };
};

function createTarballBuilderDependencies(overrides: Overrides['tarballBuilder'] = {}): {
    readonly build: SinonSpy;
} {
    return {
        build: overrides.build ?? fake.resolves(Buffer.from([-1]))
    };
}

function artifactsBuilderFactory(overrides: Overrides = {}): {
    readonly builder: ArtifactsBuilder;
    readonly fileManager: FakeFileManager;
} {
    const fileManager = overrides.fileManager ?? createFakeFileManager();
    const dependencies: ArtifactsBuilderDependencies = {
        fileManager,
        tarballBuilder: createTarballBuilderDependencies(overrides.tarballBuilder),
        progressBroadcaster: {
            emit: (): void => undefined,
            hasSubscribers: (): boolean => false
        }
    };

    return { builder: createArtifactsBuilder(dependencies), fileManager };
}

function builderWithUnreadableTargetFolder(): {
    readonly builder: ArtifactsBuilder;
    readonly fileManager: FakeFileManager;
} {
    const fileManager = createFakeFileManager({
        simulatedCheckReadabilityResponses: [{ value: { isReadable: false } }]
    });
    return artifactsBuilderFactory({ fileManager });
}

function makeContent(targetFilePath: string, content: string, isSubstituted = false): AnalyzedBundleResource {
    return {
        isSubstituted,
        isExplicitlyIncluded: false,
        directDependencies: new Set(),
        fileDescription: {
            content,
            isExecutable: false,
            sourceFilePath: '/foo/bar.txt',
            targetFilePath
        },
        analysis: {
            survivingBindings: new Set<string>(),
            sideEffectStatements: [],
            sideEffectImports: new Set<string>()
        }
    };
}

test('buildTarball() returns the tarData', async () => {
    const tarballBuilder = { build: fake.resolves(Buffer.from([42])) };
    const { builder } = artifactsBuilderFactory({ tarballBuilder });
    const result = await builder.buildTarball(bundleWithContents([]));

    assert.deepStrictEqual(result, {
        tarData: Buffer.from([42])
    });
});

test('buildTarball() passes all given contents to the tarballBuilder', async () => {
    const tarballBuilder = { build: fake.resolves(Buffer.from([])) };
    const { builder } = artifactsBuilderFactory({ tarballBuilder });
    const contents: AnalyzedBundleResource[] = [
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
    const { builder, fileManager } = builderWithUnreadableTargetFolder();

    await builder.buildFolder(bundleWithContents([], 'package.json'), '/the/target/folder');

    assert.strictEqual(fileManager.getWriteFileCallCount(), 1);
    assert.deepStrictEqual(fileManager.getWriteFileCall(0), {
        filePath: '/the/target/folder/package.json',
        content: '{}'
    });
});

test('buildFolder() throws when the target folder already exists', async () => {
    const fileManager = createFakeFileManager({
        simulatedCheckReadabilityResponses: [{ value: { isReadable: true } }]
    });
    const { builder } = artifactsBuilderFactory({ fileManager });

    try {
        await builder.buildFolder(bundleWithContents([]), '/the/target/folder');
        assert.fail('Expected buildFolder() to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual(fileManager.getCheckReadabilityCallCount(), 1);
        assert.deepStrictEqual(fileManager.getCheckReadabilityCall(0), { fileOrFolderPath: '/the/target/folder' });
        assert.strictEqual((error as Error).message, 'Folder /the/target/folder already exists');
    }
});

test('buildFolder() writes the source of a source bundle content to the given target folder', async () => {
    const { builder, fileManager } = builderWithUnreadableTargetFolder();
    const contents: AnalyzedBundleResource[] = [makeContent('bar/baz.txt', 'the-content')];
    await builder.buildFolder(bundleWithContents(contents, 'package.json'), '/the/target/folder');

    assert.strictEqual(fileManager.getWriteFileCallCount(), 2);
    assert.deepStrictEqual(fileManager.getWriteFileCall(0), {
        filePath: '/the/target/folder/package.json',
        content: '{}'
    });
    assert.deepStrictEqual(fileManager.getWriteFileCall(1), {
        filePath: '/the/target/folder/bar/baz.txt',
        content: 'the-content'
    });
});

test('collectContents() returns the list of file descriptions of the given bundle', () => {
    const { builder } = artifactsBuilderFactory();
    const contents: AnalyzedBundleResource[] = [
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

test('collectContents() appends extra files after the bundle contents and applies the prefix to them', () => {
    const { builder } = artifactsBuilderFactory();
    const result = builder.collectContents(bundleWithContents([], 'package.json'), 'package', [
        { filePath: 'sbom.cdx.json', content: '{"bomFormat":"CycloneDX"}', isExecutable: false }
    ]);

    assert.deepStrictEqual(result, [
        { filePath: 'package/package.json', content: '{}', isExecutable: false },
        { filePath: 'package/sbom.cdx.json', content: '{"bomFormat":"CycloneDX"}', isExecutable: false }
    ]);
});

test('buildTarball() forwards extra files to the tarball builder alongside the bundle contents', async () => {
    const tarballBuilder = { build: fake.resolves(Buffer.from([])) };
    const { builder } = artifactsBuilderFactory({ tarballBuilder });
    await builder.buildTarball(bundleWithContents([makeContent('bar.txt', 'bar')], 'package.json'), [
        { filePath: 'sbom.cdx.json', content: '{"bomFormat":"CycloneDX"}', isExecutable: false }
    ]);

    assert.deepStrictEqual(tarballBuilder.build.firstCall.args, [
        [
            { filePath: 'package/package.json', content: '{}', isExecutable: false },
            { filePath: 'package/bar.txt', content: 'bar', isExecutable: false },
            { filePath: 'package/sbom.cdx.json', content: '{"bomFormat":"CycloneDX"}', isExecutable: false }
        ]
    ]);
});

test('buildFolder() writes extra files alongside the bundle contents into the target folder', async () => {
    const { builder, fileManager } = builderWithUnreadableTargetFolder();

    await builder.buildFolder(bundleWithContents([], 'package.json'), '/the/target/folder', [
        { filePath: 'sbom.cdx.json', content: '{"bomFormat":"CycloneDX"}', isExecutable: false }
    ]);

    assert.strictEqual(fileManager.getWriteFileCallCount(), 2);
    assert.deepStrictEqual(fileManager.getWriteFileCall(1), {
        filePath: '/the/target/folder/sbom.cdx.json',
        content: '{"bomFormat":"CycloneDX"}'
    });
});

function artifactsBuilderWithBroadcaster(): {
    readonly builder: ArtifactsBuilder;
    readonly broadcaster: ReturnType<typeof createProgressBroadcaster>;
} {
    const broadcaster = createProgressBroadcaster();
    const dependencies: ArtifactsBuilderDependencies = {
        fileManager: createFakeFileManager(),
        tarballBuilder: { build: fake.resolves(Buffer.from([])) },
        progressBroadcaster: broadcaster.provider
    };
    return { builder: createArtifactsBuilder(dependencies), broadcaster };
}

test('collectContents() emits an artifactsCollected event with the package name when a subscriber is registered', () => {
    const { builder, broadcaster } = artifactsBuilderWithBroadcaster();
    const received: { packageName: string }[] = [];
    broadcaster.consumer.on('artifactsCollected', (payload) => {
        received.push({ packageName: payload.packageName });
    });

    builder.collectContents(bundleWithContents([makeContent('a.js', 'console.log(0)')], 'package.json'));

    assert.deepStrictEqual(received, [{ packageName: 'the-name' }]);
});

test('collectContents() emits artifact entries with size and kind classification', () => {
    const { builder, broadcaster } = artifactsBuilderWithBroadcaster();
    const received: {
        entries: readonly {
            path: string;
            sizeBytes: number;
            kind: string;
            sourcePath?: string;
            status: string;
            badges: readonly string[];
        }[];
    }[] = [];
    broadcaster.consumer.on('artifactsCollected', (payload) => {
        received.push({
            entries: payload.entries.map((entry) => {
                return {
                    path: entry.path,
                    sizeBytes: entry.sizeBytes,
                    kind: entry.kind,
                    ...(entry.sourcePath === undefined ? {} : { sourcePath: entry.sourcePath }),
                    status: entry.status,
                    badges: entry.badges
                };
            })
        });
    });

    builder.collectContents(bundleWithContents([makeContent('a.js', 'abc', true)], 'package.json'));

    assert.deepStrictEqual(received, [
        {
            entries: [
                { path: 'package.json', sizeBytes: 2, kind: 'manifest', status: 'generated', badges: [] },
                {
                    path: 'a.js',
                    sizeBytes: 3,
                    kind: 'source',
                    sourcePath: '/foo/bar.txt',
                    status: 'changed',
                    badges: ['import-path-rewrite']
                }
            ]
        }
    ]);
});

test('collectContents() emits extra generated files in artifactsCollected when subscribed', () => {
    const { builder, broadcaster } = artifactsBuilderWithBroadcaster();
    const received: {
        entries: readonly { path: string; status: string; kind: string }[];
    }[] = [];
    broadcaster.consumer.on('artifactsCollected', (payload) => {
        received.push({
            entries: payload.entries.map((entry) => {
                return { path: entry.path, status: entry.status, kind: entry.kind };
            })
        });
    });

    builder.collectContents(bundleWithContents([], 'package.json'), undefined, [
        { filePath: 'sbom.cdx.json', content: '{}', isExecutable: false }
    ]);

    assert.deepStrictEqual(received, [
        {
            entries: [
                { path: 'package.json', status: 'generated', kind: 'manifest' },
                { path: 'sbom.cdx.json', status: 'generated', kind: 'sbom' }
            ]
        }
    ]);
});

test('collectContents() does NOT emit artifactsCollected when no subscriber is registered', () => {
    const spying = createSpyingBroadcaster();
    const dependencies: ArtifactsBuilderDependencies = {
        fileManager: createFakeFileManager(),
        tarballBuilder: { build: fake.resolves(Buffer.from([])) },
        progressBroadcaster: spying.provider
    };
    const builder = createArtifactsBuilder(dependencies);

    builder.collectContents(bundleWithContents([], 'package.json'));

    assert.strictEqual(spying.emitSpy.callCount, 0);
});

test('collectContents() emits exactly once per invocation', () => {
    const { builder, broadcaster } = artifactsBuilderWithBroadcaster();
    let callCount = 0;
    broadcaster.consumer.on('artifactsCollected', () => {
        callCount += 1;
    });

    builder.collectContents(bundleWithContents([], 'package.json'));
    builder.collectContents(bundleWithContents([], 'package.json'));

    assert.strictEqual(callCount, 2);
});
