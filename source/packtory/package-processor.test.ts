import assert from 'node:assert';
import { test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Maybe } from 'true-myth';
import type { LinkedBundle } from '../linker/linked-bundle.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import type { MainPackageJson } from '../config/package-json.ts';
import type { BuildAndPublishOptions, BuildOptions, ResolveAndLinkOptions } from './map-config.ts';
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

function createVersionedBundle(
    name = 'package-a',
    version = '1.2.3',
    overrides: { readonly dependencies?: Record<string, string> } = {}
): VersionedBundleWithManifest {
    return {
        name,
        version,
        contents: [],
        dependencies: {},
        peerDependencies: {},
        additionalAttributes: {},
        mainFile: createTransferableFile('/entry.js'),
        packageType: 'module' as const,
        packageJson: {
            name,
            version,
            ...(overrides.dependencies === undefined ? {} : { dependencies: overrides.dependencies })
        },
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
    readonly generateSbom?: SinonSpy;
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
    readonly generateSbom: SinonSpy;
};

function createSpy<TSpy extends SinonSpy>(spy: TSpy | undefined, fallback: () => TSpy): TSpy {
    return spy ?? fallback();
}

function createProcessor(overrides: Overrides = {}): ProcessorContext {
    const emit = createSpy(overrides.emit, fake);
    const resolve = createSpy(overrides.resolve, () => {
        return fake.resolves(createLinkedBundle());
    });
    const linkBundle = createSpy(overrides.linkBundle, () => {
        return fake.resolves(createLinkedBundle());
    });
    const determineCurrentVersion = createSpy(overrides.determineCurrentVersion, () => {
        return fake.resolves(Maybe.nothing());
    });
    const addVersion = createSpy(overrides.addVersion, () => {
        return fake.returns(createVersionedBundle());
    });
    const increaseVersion = createSpy(overrides.increaseVersion, () => {
        return fake.returns(createVersionedBundle('package-a', '1.2.4'));
    });
    const checkBundleAlreadyPublished = createSpy(overrides.checkBundleAlreadyPublished, () => {
        return fake.resolves({ alreadyPublishedAsLatest: false });
    });
    const publish = createSpy(overrides.publish, () => {
        return fake.resolves(undefined);
    });
    const generateSbom = createSpy(overrides.generateSbom, () => {
        return fake.resolves(undefined);
    });
    const dependencies = {
        progressBroadcaster: { emit },
        resourceResolver: { resolve },
        linker: { linkBundle },
        bundleEmitter: { determineCurrentVersion, checkBundleAlreadyPublished, publish },
        versionManager: { addVersion, increaseVersion },
        sbomFileBuilder: { generate: generateSbom }
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
        publish,
        generateSbom
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
        registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
        publishSettings: { access: 'public', sbom: { enabled: false } } as const,
        bundleDependencies: [createVersionedBundle('bundle-dependency', '1.0.0')],
        bundlePeerDependencies: [createVersionedBundle('peer-dependency', '2.0.0')]
    };
}

async function tryBuildAndPublishDefault(
    processor: ReturnType<typeof createPackageProcessor>
): ReturnType<ReturnType<typeof createPackageProcessor>['tryBuildAndPublish']> {
    return processor.tryBuildAndPublish({
        linkedBundle: createLinkedBundle(),
        buildOptions: createBuildAndPublishOptions()
    });
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

test('resolveAndLink() rejects non-ESM mainPackageJson values', async () => {
    const { processor } = createProcessor();
    const invalidMainPackageJson = {};
    const options: ResolveAndLinkOptions = {
        ...createResolveOptions(),
        mainPackageJson: invalidMainPackageJson as MainPackageJson
    };

    try {
        await processor.resolveAndLink(options);
        assert.fail('Expected processor.resolveAndLink() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'mainPackageJson.type must be "module"');
    }
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

test('build() rejects non-ESM mainPackageJson values', async () => {
    const { processor } = createProcessor();
    const invalidMainPackageJson = {};
    const options: BuildOptions = {
        ...createBuildAndPublishOptions(),
        version: '3.4.5',
        mainPackageJson: invalidMainPackageJson as MainPackageJson
    };

    try {
        await processor.build(options);
        assert.fail('Expected processor.build() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'mainPackageJson.type must be "module"');
    }
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
    assert.deepStrictEqual(checkBundleAlreadyPublished.firstCall.args, [
        {
            bundle: versionedBundle,
            registrySettings: { auth: { type: 'bearer-token', token: 'token' } }
        }
    ]);
    assert.deepStrictEqual(getCallArgs(emit), [['building', { packageName: 'package-a', version: '0.0.0' }]]);
});

test('tryBuildAndPublish() rebuilds with an increased version for the first publish', async () => {
    const initialBundle = createVersionedBundle('package-a', '0.0.0');
    const rebuiltBundle = createVersionedBundle('package-a', '0.0.1');
    const determineCurrentVersion = fake.resolves(Maybe.nothing());
    const { processor, emit } = createProcessor({
        determineCurrentVersion,
        addVersion: fake.returns(initialBundle),
        increaseVersion: fake.returns(rebuiltBundle)
    });

    const result = await tryBuildAndPublishDefault(processor);

    assert.deepStrictEqual(result, { bundle: rebuiltBundle, status: 'initial-version' });
    assert.deepStrictEqual(determineCurrentVersion.firstCall.args, [
        {
            name: 'package-a',
            registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
            versioning: { automatic: true }
        }
    ]);
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

    const result = await tryBuildAndPublishDefault(processor);

    assert.deepStrictEqual(result, { bundle: rebuiltBundle, status: 'new-version' });
});

test('tryBuildAndPublish() keeps the configured manual version without rebuilding on the initial publish', async () => {
    const manualBundle = createVersionedBundle('package-a', '4.5.6');
    const { processor, increaseVersion, emit } = createProcessor({
        determineCurrentVersion: fake.resolves(Maybe.nothing()),
        addVersion: fake.returns(manualBundle)
    });

    const buildOptions: BuildAndPublishOptions = {
        ...createBuildAndPublishOptions(),
        versioning: { automatic: false, version: '4.5.6' }
    };
    const result = await processor.tryBuildAndPublish({
        linkedBundle: createLinkedBundle(),
        buildOptions
    });

    assert.deepStrictEqual(result, { bundle: manualBundle, status: 'initial-version' });
    assert.strictEqual(increaseVersion.callCount, 0);
    assert.deepStrictEqual(getCallArgs(emit), [['building', { packageName: 'package-a', version: '4.5.6' }]]);
});

test('tryBuildAndPublish() keeps the current published version without rebuilding when automatic versioning is disabled', async () => {
    const currentBundle = createVersionedBundle('package-a', '2.0.0');
    const { processor, increaseVersion, emit } = createProcessor({
        determineCurrentVersion: fake.resolves(Maybe.just('2.0.0')),
        addVersion: fake.returns(currentBundle)
    });

    const buildOptions: BuildAndPublishOptions = {
        ...createBuildAndPublishOptions(),
        versioning: { automatic: false, version: '9.9.9' }
    };
    const result = await processor.tryBuildAndPublish({
        linkedBundle: createLinkedBundle(),
        buildOptions
    });

    assert.deepStrictEqual(result, { bundle: currentBundle, status: 'new-version' });
    assert.strictEqual(increaseVersion.callCount, 0);
    assert.deepStrictEqual(getCallArgs(emit), [['building', { packageName: 'package-a', version: '2.0.0' }]]);
});

test('tryBuildAndPublish() uses minimumVersion for the first automatic publish without rebuilding', async () => {
    const minimumVersionBundle = createVersionedBundle('package-a', '1.2.3');
    const { processor, increaseVersion, emit } = createProcessor({
        determineCurrentVersion: fake.resolves(Maybe.nothing()),
        addVersion: fake.returns(minimumVersionBundle)
    });

    const buildOptions: BuildAndPublishOptions = {
        ...createBuildAndPublishOptions(),
        versioning: { automatic: true, minimumVersion: '1.2.3' }
    };
    const result = await processor.tryBuildAndPublish({
        linkedBundle: createLinkedBundle(),
        buildOptions
    });

    assert.deepStrictEqual(result, { bundle: minimumVersionBundle, status: 'initial-version' });
    assert.strictEqual(increaseVersion.callCount, 0);
    assert.deepStrictEqual(getCallArgs(emit), [['building', { packageName: 'package-a', version: '1.2.3' }]]);
});

test('tryBuildAndPublish() forwards the fully built addVersion payload before publication checks', async () => {
    const addVersion = fake.returns(createVersionedBundle('package-a', '1.2.3'));
    const checkBundleAlreadyPublished = fake.resolves({ alreadyPublishedAsLatest: false });
    const { processor } = createProcessor({
        determineCurrentVersion: fake.resolves(Maybe.just('1.2.3')),
        addVersion,
        checkBundleAlreadyPublished
    });

    const linkedBundle = createLinkedBundle();
    const buildOptions = createBuildAndPublishOptions();
    await processor.tryBuildAndPublish({ linkedBundle, buildOptions });

    assert.deepStrictEqual(addVersion.firstCall.args, [
        {
            bundle: linkedBundle,
            ...buildOptions,
            version: '1.2.3'
        }
    ]);
});

test('tryBuildAndPublish() keeps the configured manual version without rebuilding on a rerun', async () => {
    const manualBundle = createVersionedBundle('package-a', '3.2.1');
    const { processor, increaseVersion, emit } = createProcessor({
        determineCurrentVersion: fake.resolves(Maybe.just('3.2.1')),
        addVersion: fake.returns(manualBundle)
    });

    const result = await processor.tryBuildAndPublish({
        linkedBundle: createLinkedBundle(),
        buildOptions: {
            ...createBuildAndPublishOptions(),
            versioning: { automatic: false, version: '3.2.1' }
        }
    });

    assert.deepStrictEqual(result, { bundle: manualBundle, status: 'new-version' });
    assert.strictEqual(increaseVersion.callCount, 0);
    assert.deepStrictEqual(getCallArgs(emit), [['building', { packageName: 'package-a', version: '3.2.1' }]]);
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
    assert.deepStrictEqual(publish.firstCall.args, [
        {
            bundle: rebuiltBundle,
            registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
            publishSettings: { access: 'public', sbom: { enabled: false } }
        }
    ]);
    assert.deepStrictEqual(getCallArgs(emit), [
        ['building', { packageName: 'package-a', version: '1.2.3' }],
        ['rebuilding', { packageName: 'package-a', version: '1.2.3' }],
        ['publishing', { packageName: 'package-a', version: '1.2.4' }]
    ]);
});

function setupSbomScenario(
    sbomResult: readonly { filePath: string; content: string; isExecutable: boolean }[] | undefined
): {
    readonly bundle: VersionedBundleWithManifest;
    readonly linkedBundle: LinkedBundle;
    readonly generateSbom: SinonSpy;
    readonly checkBundleAlreadyPublished: SinonSpy;
    readonly processor: ReturnType<typeof createPackageProcessor>;
} {
    const bundle = createVersionedBundle('package-a', '1.2.3');
    const linkedBundle = createLinkedBundle();
    const generateSbom = fake.resolves(sbomResult);
    const checkBundleAlreadyPublished = fake.resolves({ alreadyPublishedAsLatest: false });
    const { processor } = createProcessor({
        determineCurrentVersion: fake.resolves(Maybe.just('1.2.3')),
        addVersion: fake.returns(bundle),
        checkBundleAlreadyPublished,
        generateSbom
    });
    return { bundle, linkedBundle, generateSbom, checkBundleAlreadyPublished, processor };
}

test('tryBuildAndPublish() invokes the sbomFileBuilder with the resolved bundle, siblings, and publish settings', async () => {
    const sbomFile = { filePath: 'sbom.cdx.json', content: '{"sbom":"stub"}', isExecutable: false };
    const { bundle, linkedBundle, generateSbom, checkBundleAlreadyPublished, processor } = setupSbomScenario([
        sbomFile
    ]);

    const buildOptions: BuildAndPublishOptions = {
        ...createBuildAndPublishOptions(),
        publishSettings: { access: 'public', sbom: { enabled: true } }
    };
    await processor.tryBuildAndPublish({ linkedBundle, buildOptions });

    assert.strictEqual(generateSbom.callCount, 1);
    const expectedSiblings = [...buildOptions.bundleDependencies, ...buildOptions.bundlePeerDependencies];
    assert.deepStrictEqual(generateSbom.firstCall.args, [
        bundle,
        expectedSiblings,
        { access: 'public', sbom: { enabled: true } }
    ]);
    const checkArgs = checkBundleAlreadyPublished.firstCall.args[0] as { extraFiles: readonly unknown[] };
    assert.deepStrictEqual(checkArgs.extraFiles, [sbomFile]);
});

test('tryBuildAndPublish() omits extraFiles when sbomFileBuilder returns undefined', async () => {
    const { linkedBundle, checkBundleAlreadyPublished, processor } = setupSbomScenario(undefined);

    await processor.tryBuildAndPublish({ linkedBundle, buildOptions: createBuildAndPublishOptions() });

    const checkArgs = checkBundleAlreadyPublished.firstCall.args[0] as Record<string, unknown>;
    assert.strictEqual('extraFiles' in checkArgs, false);
});

test('buildAndPublish() forwards extraFiles from sbomFileBuilder to publish', async () => {
    const rebuiltBundle = createVersionedBundle('package-a', '1.2.4');
    const publish = fake.resolves(undefined);
    const generateSbom = fake.resolves([
        { filePath: 'sbom.cdx.json', content: '{"sbom":"stub"}', isExecutable: false }
    ]);
    const { processor } = createProcessor({
        determineCurrentVersion: fake.resolves(Maybe.just('1.2.3')),
        addVersion: fake.returns(createVersionedBundle('package-a', '1.2.3')),
        increaseVersion: fake.returns(rebuiltBundle),
        publish,
        generateSbom
    });

    const options: DetermineVersionAndPublishOptions = {
        linkedBundle: createLinkedBundle(),
        buildOptions: { ...createBuildAndPublishOptions(), publishSettings: { access: 'public' } }
    };
    await processor.buildAndPublish(options);

    const publishArgs = publish.firstCall.args[0] as { extraFiles: readonly unknown[] };
    assert.deepStrictEqual(publishArgs.extraFiles, [
        { filePath: 'sbom.cdx.json', content: '{"sbom":"stub"}', isExecutable: false }
    ]);
});
