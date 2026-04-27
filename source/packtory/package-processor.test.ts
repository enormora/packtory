import assert from 'node:assert';
import { test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Maybe } from 'true-myth';
import type { LinkedBundle } from '../linker/linked-bundle.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import type { BuildAndPublishOptions, ResolveAndLinkOptions } from './map-config.ts';
import {
    createPackageProcessor,
    type BuildAndPublishResult,
    type DetermineVersionAndPublishOptions
} from './package-processor.ts';

type TransferableFile = {
    readonly sourceFilePath: string;
    readonly targetFilePath: string;
    readonly content: string;
    readonly isExecutable: boolean;
};

function createTransferableFile(filePath: string, targetFilePath = filePath.slice(1)): TransferableFile {
    return {
        sourceFilePath: filePath,
        targetFilePath,
        content: '',
        isExecutable: false
    };
}

function createLinkedBundle(name = 'package-a'): LinkedBundle {
    return {
        name,
        contents: [],
        entryPoints: [{ js: createTransferableFile('/entry.js') }] as const,
        linkedBundleDependencies: new Map(),
        externalDependencies: new Map()
    };
}

function createVersionedBundle(name = 'package-a', version = '1.2.3'): VersionedBundleWithManifest {
    return {
        name,
        version,
        contents: [],
        dependencies: {},
        peerDependencies: {},
        additionalAttributes: {},
        mainFile: createTransferableFile('/entry.js'),
        packageType: 'module' as const,
        packageJson: { name, version },
        manifestFile: { filePath: 'package.json', content: '{}', isExecutable: false }
    };
}

type Overrides = {
    readonly emit?: SinonSpy;
    readonly resolve?: SinonSpy;
    readonly linkBundle?: SinonSpy;
    readonly determineCurrentVersion?: SinonSpy;
    readonly addVersion?: SinonSpy;
    readonly increaseVersion?: SinonSpy;
    readonly checkBundleAlreadyPublished?: SinonSpy;
    readonly publish?: SinonSpy;
};

type ProcessorContext = {
    readonly processor: ReturnType<typeof createPackageProcessor>;
    readonly emit: SinonSpy;
    readonly resolve: SinonSpy;
    readonly linkBundle: SinonSpy;
    readonly determineCurrentVersion: SinonSpy;
    readonly addVersion: SinonSpy;
    readonly increaseVersion: SinonSpy;
    readonly checkBundleAlreadyPublished: SinonSpy;
    readonly publish: SinonSpy;
};

// eslint-disable-next-line complexity -- test dependency setup is intentionally centralized here
function createProcessor(overrides: Overrides = {}): ProcessorContext {
    const {
        emit = fake(),
        resolve = fake.resolves(createLinkedBundle()),
        linkBundle = fake.resolves(createLinkedBundle()),
        determineCurrentVersion = fake.resolves(Maybe.nothing()),
        addVersion = fake.returns(createVersionedBundle()),
        increaseVersion = fake.returns(createVersionedBundle('package-a', '1.2.4')),
        checkBundleAlreadyPublished = fake.resolves({ alreadyPublishedAsLatest: false }),
        publish = fake.resolves(undefined)
    } = overrides;
    const dependencies = {
        progressBroadcaster: { emit },
        resourceResolver: { resolve },
        linker: { linkBundle },
        bundleEmitter: { determineCurrentVersion, checkBundleAlreadyPublished, publish },
        versionManager: { addVersion, increaseVersion }
    } as const;

    return {
        processor: createPackageProcessor(dependencies),
        emit,
        resolve,
        linkBundle,
        determineCurrentVersion,
        addVersion,
        increaseVersion,
        checkBundleAlreadyPublished,
        publish
    };
}

function createResolveOptions(): ResolveAndLinkOptions {
    return {
        name: 'package-a',
        sourcesFolder: '/src',
        entryPoints: [{ js: '/src/index.js' }] as const,
        includeSourceMapFiles: true,
        additionalFiles: [{ sourceFilePath: '/src/readme.md', targetFilePath: 'readme.md' }],
        moduleResolution: 'module' as const,
        mainPackageJson: { type: 'module' as const, dependencies: { dep: '^1.0.0' } },
        additionalPackageJsonAttributes: { publishConfig: { access: 'public' } },
        bundleDependencies: [{ name: 'bundle-dependency', contents: [] }],
        bundlePeerDependencies: [{ name: 'peer-dependency', contents: [] }]
    };
}

function createBuildAndPublishOptions(): BuildAndPublishOptions {
    return {
        ...createResolveOptions(),
        versioning: { automatic: true } as const,
        registrySettings: { token: 'token' },
        bundleDependencies: [createVersionedBundle('bundle-dependency', '1.0.0')],
        bundlePeerDependencies: [createVersionedBundle('peer-dependency', '2.0.0')]
    };
}

function getCallArgs(spy: SinonSpy): unknown[][] {
    return spy.getCalls().map((call): unknown[] => {
        return Array.from(call.args);
    });
}

test('resolveAndLink() emits progress events and links the resolved bundle with all dependency bundles', async () => {
    const linkedBundle = createLinkedBundle();
    const resolve = fake.resolves({
        name: 'package-a',
        contents: [],
        entryPoints: [],
        externalDependencies: new Map()
    });
    const linkBundle = fake.resolves(linkedBundle);
    const { processor, emit } = createProcessor({ resolve, linkBundle });

    const options = createResolveOptions();
    const result = await processor.resolveAndLink(options);

    assert.strictEqual(result, linkedBundle);
    assert.deepStrictEqual(resolve.firstCall.args, [options]);
    assert.deepStrictEqual(linkBundle.firstCall.args, [
        {
            bundle: {
                name: 'package-a',
                contents: [],
                entryPoints: [],
                externalDependencies: new Map()
            },
            bundleDependencies: [...options.bundleDependencies, ...options.bundlePeerDependencies]
        }
    ]);
    assert.deepStrictEqual(getCallArgs(emit), [
        ['resolving', { packageName: 'package-a' }],
        ['linking', { packageName: 'package-a' }]
    ]);
});

test('build() resolves, links, and forwards the mapped build options to versionManager.addVersion()', async () => {
    const linkedBundle = createLinkedBundle();
    const linkBundle = fake.resolves(linkedBundle);
    const addVersion = fake.returns(createVersionedBundle());
    const { processor, addVersion: addVersionSpy } = createProcessor({ linkBundle, addVersion });

    const result = await processor.build({
        ...createBuildAndPublishOptions(),
        version: '3.4.5'
    });

    assert.strictEqual(result.packageJson.version, '1.2.3');
    assert.deepStrictEqual(addVersionSpy.firstCall.args, [
        {
            bundle: linkedBundle,
            version: '3.4.5',
            mainPackageJson: { type: 'module', dependencies: { dep: '^1.0.0' } },
            bundleDependencies: [createVersionedBundle('bundle-dependency', '1.0.0')],
            bundlePeerDependencies: [createVersionedBundle('peer-dependency', '2.0.0')],
            additionalPackageJsonAttributes: { publishConfig: { access: 'public' } }
        }
    ]);
});

test('tryBuildAndPublish() returns already-published when the emitted bundle already matches the latest version', async () => {
    const versionedBundle = createVersionedBundle('package-a', '0.0.0');
    const checkBundleAlreadyPublished = fake.resolves({ alreadyPublishedAsLatest: true });
    const { processor, increaseVersion, emit } = createProcessor({
        addVersion: fake.returns(versionedBundle),
        checkBundleAlreadyPublished
    });

    const result = await processor.tryBuildAndPublish({
        linkedBundle: createLinkedBundle(),
        buildOptions: createBuildAndPublishOptions()
    });

    assert.deepStrictEqual(result, { bundle: versionedBundle, status: 'already-published' });
    assert.strictEqual(increaseVersion.callCount, 0);
    assert.deepStrictEqual(getCallArgs(emit), [['building', { packageName: 'package-a', version: '0.0.0' }]]);
});

test('tryBuildAndPublish() rebuilds with an increased version for the first publish', async () => {
    const initialBundle = createVersionedBundle('package-a', '0.0.0');
    const rebuiltBundle = createVersionedBundle('package-a', '0.0.1');
    const { processor, emit } = createProcessor({
        determineCurrentVersion: fake.resolves(Maybe.nothing()),
        addVersion: fake.returns(initialBundle),
        increaseVersion: fake.returns(rebuiltBundle)
    });

    const result = await processor.tryBuildAndPublish({
        linkedBundle: createLinkedBundle(),
        buildOptions: createBuildAndPublishOptions()
    });

    assert.deepStrictEqual(result, { bundle: rebuiltBundle, status: 'initial-version' });
    assert.deepStrictEqual(getCallArgs(emit), [
        ['building', { packageName: 'package-a', version: '0.0.0' }],
        ['rebuilding', { packageName: 'package-a', version: '0.0.0' }]
    ]);
});

test('tryBuildAndPublish() returns new-version when the package already has a published version', async () => {
    const initialBundle = createVersionedBundle('package-a', '2.0.0');
    const rebuiltBundle = createVersionedBundle('package-a', '2.0.1');
    const { processor } = createProcessor({
        determineCurrentVersion: fake.resolves(Maybe.just('2.0.0')),
        addVersion: fake.returns(initialBundle),
        increaseVersion: fake.returns(rebuiltBundle)
    });

    const result = await processor.tryBuildAndPublish({
        linkedBundle: createLinkedBundle(),
        buildOptions: createBuildAndPublishOptions()
    });

    assert.deepStrictEqual(result, { bundle: rebuiltBundle, status: 'new-version' });
});

test('buildAndPublish() returns immediately when the package is already published', async () => {
    const publish = fake.resolves(undefined);
    const alreadyPublishedResult: BuildAndPublishResult = {
        bundle: createVersionedBundle(),
        status: 'already-published'
    };
    const { processor, emit } = createProcessor({
        determineCurrentVersion: fake.resolves(Maybe.just('1.2.3')),
        addVersion: fake.returns(createVersionedBundle()),
        checkBundleAlreadyPublished: fake.resolves({ alreadyPublishedAsLatest: true }),
        publish
    });

    const result = await processor.buildAndPublish({
        linkedBundle: createLinkedBundle(),
        buildOptions: createBuildAndPublishOptions()
    });

    assert.deepStrictEqual(result, alreadyPublishedResult);
    assert.strictEqual(publish.callCount, 0);
    assert.deepStrictEqual(getCallArgs(emit), [['building', { packageName: 'package-a', version: '1.2.3' }]]);
});

test('buildAndPublish() publishes the rebuilt bundle and emits publishing progress', async () => {
    const rebuiltBundle = createVersionedBundle('package-a', '1.2.4');
    const publish = fake.resolves(undefined);
    const { processor, emit } = createProcessor({
        determineCurrentVersion: fake.resolves(Maybe.just('1.2.3')),
        addVersion: fake.returns(createVersionedBundle('package-a', '1.2.3')),
        increaseVersion: fake.returns(rebuiltBundle),
        publish
    });

    const options: DetermineVersionAndPublishOptions = {
        linkedBundle: createLinkedBundle(),
        buildOptions: createBuildAndPublishOptions()
    };
    const result = await processor.buildAndPublish(options);

    assert.deepStrictEqual(result, { bundle: rebuiltBundle, status: 'new-version' });
    assert.deepStrictEqual(publish.firstCall.args, [{ bundle: rebuiltBundle, registrySettings: { token: 'token' } }]);
    assert.deepStrictEqual(getCallArgs(emit), [
        ['building', { packageName: 'package-a', version: '1.2.3' }],
        ['rebuilding', { packageName: 'package-a', version: '1.2.3' }],
        ['publishing', { packageName: 'package-a', version: '1.2.4' }]
    ]);
});
