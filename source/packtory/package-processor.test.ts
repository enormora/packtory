import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Maybe } from 'true-myth';
import { noPublication, publishedToRegistry, stagedForApproval } from '../bundle-emitter/publication-outcome.ts';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
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
        roots: { main: { js: createTransferableFile('/entry.js') } } as const,
        surface: { mode: 'implicit', defaultModuleRoot: 'main' } as const,
        linkedBundleDependencies: new Map(),
        externalDependencies: new Map()
    };
}

function createAnalyzedBundle(name = 'package-a'): AnalyzedBundle {
    return {
        ...createLinkedBundle(name),
        contents: [],
        sideEffectsField: undefined
    };
}

function createAnalyzedResource(
    sourceFilePath: string,
    targetFilePath = sourceFilePath.slice(1)
): AnalyzedBundle['contents'][number] {
    return {
        fileDescription: createTransferableFile(sourceFilePath, targetFilePath),
        directDependencies: new Set(),
        isExplicitlyIncluded: false,
        isSubstituted: false,
        analysis: {
            sideEffectImports: new Set(),
            sideEffectStatements: [],
            survivingBindings: new Set()
        }
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
        roots: { main: { js: createTransferableFile('/entry.js') } } as const,
        surface: { mode: 'implicit', defaultModuleRoot: 'main' } as const,
        dependencies: {},
        peerDependencies: {},
        additionalAttributes: {},
        exportsField: { '.': { import: './entry.js' } },
        mainFile: createTransferableFile('/entry.js'),
        packageType: 'module' as const,
        sideEffectsField: undefined,
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
    readonly hasSubscribers?: SinonSpy;
    readonly resolve?: SinonSpy;
    readonly linkBundle?: SinonSpy;
    readonly determineCurrentVersion?: SinonSpy;
    readonly addVersion?: SinonSpy;
    readonly increaseVersion?: SinonSpy;
    readonly checkBundleAlreadyPublished?: SinonSpy;
    readonly publish?: SinonSpy;
    readonly generateSbom?: SinonSpy;
    readonly eliminate?: SinonSpy;
    readonly repositoryFolder?: string;
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
    const hasSubscribers = createSpy(overrides.hasSubscribers, () => {
        return fake.returns(false);
    });
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
        return fake.resolves({ alreadyPublishedAsLatest: false, previousReleaseArtifacts: Maybe.nothing() });
    });
    const publish = createSpy(overrides.publish, () => {
        return fake.resolves(undefined);
    });
    const generateSbom = createSpy(overrides.generateSbom, () => {
        return fake.resolves(undefined);
    });
    const eliminate = createSpy(overrides.eliminate, () => {
        return fake(async (eliminationInputs: readonly { readonly bundle: LinkedBundle }[]) => {
            return eliminationInputs.map((input) => {
                return { ...input.bundle, contents: [], sideEffectsField: undefined } satisfies AnalyzedBundle;
            });
        });
    });
    const dependencies = {
        progressBroadcaster: { emit, hasSubscribers },
        resourceResolver: { resolve },
        linker: { linkBundle },
        bundleEmitter: { determineCurrentVersion, checkBundleAlreadyPublished, publish },
        versionManager: { addVersion, increaseVersion },
        sbomFileBuilder: { generate: generateSbom },
        deadCodeEliminator: { eliminate },
        fileManager: {
            async checkReadability() {
                return { isReadable: true };
            },
            async readFile() {
                return '';
            }
        },
        repositoryFolder: overrides.repositoryFolder ?? '/'
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
        roots: { main: { js: '/src/index.js' } } as const,
        includeSourceMapFiles: true,
        additionalFiles: [{ sourceFilePath: '/src/readme.md', targetFilePath: 'readme.md' }],
        mainPackageJson: { type: 'module' as const, dependencies: { dep: '^1.0.0' } },
        additionalChangelogSourceFiles: [],
        additionalPackageJsonAttributes: { publishConfig: { access: 'public' } },
        allowMutableSpecifiers: [],
        bundleDependencies: [createLinkedBundle('bundle-dependency')],
        bundlePeerDependencies: [createLinkedBundle('peer-dependency')]
    };
}

function createBuildAndPublishOptions(): BuildAndPublishOptions {
    return {
        ...createResolveOptions(),
        versioning: { automatic: true } as const,
        registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
        publishSettings: { access: 'public', sbom: { enabled: false } } as const,
        ignoredAttributionPaths: [],
        bundleDependencies: [createVersionedBundle('bundle-dependency', '1.0.0')],
        bundlePeerDependencies: [createVersionedBundle('peer-dependency', '2.0.0')]
    };
}

function createDetermineVersionAndPublishOptions(): DetermineVersionAndPublishOptions {
    return {
        analyzedBundle: createAnalyzedBundle(),
        buildOptions: createBuildAndPublishOptions(),
        stage: false
    };
}

async function tryBuildAndPublishDefault(
    processor: ReturnType<typeof createPackageProcessor>
): ReturnType<ReturnType<typeof createPackageProcessor>['tryBuildAndPublish']> {
    return processor.tryBuildAndPublish(createDetermineVersionAndPublishOptions());
}

function getCallArgs(spy: SinonSpy): unknown[][] {
    return spy.getCalls().map((call): unknown[] => {
        return Array.from(call.args);
    });
}

suite('package-processor', function () {
    test('resolveAndLink() emits progress events and links the resolved bundle with all dependency bundles', async function () {
        const linkedBundle = createLinkedBundle();
        const resolve = fake.resolves({
            name: 'package-a',
            contents: [],
            roots: { main: { js: createTransferableFile('/entry.js') } } as const,
            surface: { mode: 'implicit', defaultModuleRoot: 'main' } as const,
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
                    roots: { main: { js: createTransferableFile('/entry.js') } },
                    surface: { mode: 'implicit', defaultModuleRoot: 'main' },
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

    test('build() resolves, links, runs the dead-code eliminator, and forwards to versionManager.addVersion()', async function () {
        const linkedBundle = createLinkedBundle();
        const linkBundle = fake.resolves(linkedBundle);
        const addVersion = fake.returns(createVersionedBundle());
        const { processor, addVersion: addVersionSpy, resolve } = createProcessor({ linkBundle, addVersion });

        const result = await processor.build({
            ...createBuildAndPublishOptions(),
            version: '3.4.5'
        });

        assert.strictEqual(result.packageJson.version, '1.2.3');
        assert.deepStrictEqual(resolve.firstCall.args, [
            {
                name: 'package-a',
                sourcesFolder: '/src',
                roots: { main: { js: '/src/index.js' } },
                surface: { mode: 'implicit', defaultModuleRoot: 'main' },
                includeSourceMapFiles: true,
                additionalFiles: [{ sourceFilePath: '/src/readme.md', targetFilePath: 'readme.md' }],
                mainPackageJson: { type: 'module', dependencies: { dep: '^1.0.0' } },
                additionalChangelogSourceFiles: [],
                additionalPackageJsonAttributes: { publishConfig: { access: 'public' } },
                allowMutableSpecifiers: [],
                bundleDependencies: [createVersionedBundle('bundle-dependency', '1.0.0')],
                bundlePeerDependencies: [createVersionedBundle('peer-dependency', '2.0.0')]
            }
        ]);
        assert.deepStrictEqual(addVersionSpy.firstCall.args, [
            {
                bundle: { ...linkedBundle, contents: [], sideEffectsField: undefined },
                version: '3.4.5',
                mainPackageJson: { type: 'module', dependencies: { dep: '^1.0.0' } },
                bundleDependencies: [createVersionedBundle('bundle-dependency', '1.0.0')],
                bundlePeerDependencies: [createVersionedBundle('peer-dependency', '2.0.0')],
                additionalPackageJsonAttributes: { publishConfig: { access: 'public' } },
                allowMutableSpecifiers: []
            }
        ]);
    });

    test('build() forwards deadCodeElimination settings to the eliminator', async function () {
        const eliminate = fake(
            async (inputs: readonly { transformationsEnabled: boolean; deadCodeElimination?: unknown }[]) => {
                return inputs.map((entry) => {
                    return {
                        ...createLinkedBundle(),
                        contents: [],
                        sideEffectsField: undefined,
                        transformationsEnabledFlag: entry.transformationsEnabled
                    };
                });
            }
        );
        const { processor } = createProcessor({ eliminate });
        const deadCodeElimination = { enabled: false, pureConstructors: ['Set'] } as const;

        await processor.build({
            ...createBuildAndPublishOptions(),
            version: '1.0.0',
            deadCodeElimination
        });

        const eliminationInputs = eliminate.firstCall.args[0] as readonly {
            readonly transformationsEnabled: boolean;
            readonly deadCodeElimination?: typeof deadCodeElimination;
        }[];
        const firstInput = eliminationInputs[0];
        assert.ok(firstInput);
        assert.strictEqual(firstInput.transformationsEnabled, false);
        assert.deepStrictEqual(firstInput.deadCodeElimination, deadCodeElimination);
    });

    test('build() defaults transformationsEnabled to true when deadCodeElimination is not configured', async function () {
        const eliminate = fake(async (inputs: readonly { transformationsEnabled: boolean }[]) => {
            return inputs.map(() => {
                return { ...createLinkedBundle(), contents: [], sideEffectsField: undefined };
            });
        });
        const { processor } = createProcessor({ eliminate });

        await processor.build({ ...createBuildAndPublishOptions(), version: '1.0.0' });

        const eliminationInputs = eliminate.firstCall.args[0] as readonly { transformationsEnabled: boolean }[];
        const firstInput = eliminationInputs[0];
        assert.ok(firstInput);
        assert.strictEqual(firstInput.transformationsEnabled, true);
    });

    test('build() throws when the dead-code eliminator returns no bundle', async function () {
        const eliminate = fake.resolves([]);
        const { processor } = createProcessor({ eliminate });

        try {
            await processor.build({
                ...createBuildAndPublishOptions(),
                version: '3.4.5'
            });
            assert.fail('Expected processor.build() should fail but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'Dead code eliminator returned no bundle for "package-a"');
        }
    });

    test('tryBuildAndPublish() returns already-published when the emitted bundle already matches the latest version', async function () {
        const versionedBundle = createVersionedBundle('package-a', '0.0.0');
        const checkBundleAlreadyPublished = fake.resolves({
            alreadyPublishedAsLatest: true,
            previousReleaseArtifacts: Maybe.nothing()
        });
        const { processor, increaseVersion, emit } = createProcessor({
            addVersion: fake.returns(versionedBundle),
            checkBundleAlreadyPublished
        });

        const result = await processor.tryBuildAndPublish({
            analyzedBundle: createAnalyzedBundle(),
            buildOptions: createBuildAndPublishOptions(),
            stage: false
        });

        assert.deepStrictEqual(result, {
            bundle: versionedBundle,
            status: 'already-published',
            publication: noPublication,
            extraFiles: [],
            previousReleaseArtifacts: Maybe.nothing()
        });
        assert.strictEqual(increaseVersion.callCount, 0);
        assert.deepStrictEqual(checkBundleAlreadyPublished.firstCall.args, [
            {
                bundle: versionedBundle,
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } }
            }
        ]);
        assert.deepStrictEqual(getCallArgs(emit), [['building', { packageName: 'package-a', version: '0.0.0' }]]);
    });

    test('tryBuildAndPublish() rebuilds with an increased version for the first publish', async function () {
        const initialBundle = createVersionedBundle('package-a', '0.0.0');
        const rebuiltBundle = createVersionedBundle('package-a', '0.0.1');
        const determineCurrentVersion = fake.resolves(Maybe.nothing());
        const { processor, emit } = createProcessor({
            determineCurrentVersion,
            addVersion: fake.returns(initialBundle),
            increaseVersion: fake.returns(rebuiltBundle)
        });

        const result = await tryBuildAndPublishDefault(processor);

        assert.deepStrictEqual(result, {
            bundle: rebuiltBundle,
            status: 'initial-version',
            publication: noPublication,
            extraFiles: [],
            previousReleaseArtifacts: Maybe.nothing()
        });
        assert.deepStrictEqual(determineCurrentVersion.firstCall.args, [
            {
                name: 'package-a',
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                stage: false,
                versioning: { automatic: true }
            }
        ]);
        assert.deepStrictEqual(getCallArgs(emit), [
            ['building', { packageName: 'package-a', version: '0.0.0' }],
            ['rebuilding', { packageName: 'package-a', version: '0.0.0' }]
        ]);
    });

    test('tryBuildAndPublish() returns new-version when the package already has a published version', async function () {
        const initialBundle = createVersionedBundle('package-a', '2.0.0');
        const rebuiltBundle = createVersionedBundle('package-a', '2.0.1');
        const { processor } = createProcessor({
            determineCurrentVersion: fake.resolves(Maybe.just('2.0.0')),
            addVersion: fake.returns(initialBundle),
            increaseVersion: fake.returns(rebuiltBundle)
        });

        const result = await tryBuildAndPublishDefault(processor);

        assert.deepStrictEqual(result, {
            bundle: rebuiltBundle,
            status: 'new-version',
            publication: noPublication,
            extraFiles: [],
            previousReleaseArtifacts: Maybe.nothing()
        });
    });

    test('tryBuildAndPublish() keeps the configured manual version without rebuilding on the initial publish', async function () {
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
            analyzedBundle: createAnalyzedBundle(),
            buildOptions,
            stage: false
        });

        assert.deepStrictEqual(result, {
            bundle: manualBundle,
            status: 'initial-version',
            publication: noPublication,
            extraFiles: [],
            previousReleaseArtifacts: Maybe.nothing()
        });
        assert.strictEqual(increaseVersion.callCount, 0);
        assert.deepStrictEqual(getCallArgs(emit), [['building', { packageName: 'package-a', version: '4.5.6' }]]);
    });

    test('tryBuildAndPublish() keeps the current published version without rebuilding when automatic versioning is disabled', async function () {
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
            analyzedBundle: createAnalyzedBundle(),
            buildOptions,
            stage: false
        });

        assert.deepStrictEqual(result, {
            bundle: currentBundle,
            status: 'new-version',
            publication: noPublication,
            extraFiles: [],
            previousReleaseArtifacts: Maybe.nothing()
        });
        assert.strictEqual(increaseVersion.callCount, 0);
        assert.deepStrictEqual(getCallArgs(emit), [['building', { packageName: 'package-a', version: '2.0.0' }]]);
    });

    test('tryBuildAndPublish() uses minimumVersion for the first automatic publish without rebuilding', async function () {
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
            analyzedBundle: createAnalyzedBundle(),
            buildOptions,
            stage: false
        });

        assert.deepStrictEqual(result, {
            bundle: minimumVersionBundle,
            status: 'initial-version',
            publication: noPublication,
            extraFiles: [],
            previousReleaseArtifacts: Maybe.nothing()
        });
        assert.strictEqual(increaseVersion.callCount, 0);
        assert.deepStrictEqual(getCallArgs(emit), [['building', { packageName: 'package-a', version: '1.2.3' }]]);
    });

    test('tryBuildAndPublish() forwards the fully built addVersion payload before publication checks', async function () {
        const addVersion = fake.returns(createVersionedBundle('package-a', '1.2.3'));
        const checkBundleAlreadyPublished = fake.resolves({
            alreadyPublishedAsLatest: false,
            previousReleaseArtifacts: Maybe.nothing()
        });
        const { processor } = createProcessor({
            determineCurrentVersion: fake.resolves(Maybe.just('1.2.3')),
            addVersion,
            checkBundleAlreadyPublished
        });

        const analyzedBundle = createAnalyzedBundle();
        const buildOptions = createBuildAndPublishOptions();
        await processor.tryBuildAndPublish({ analyzedBundle, buildOptions, stage: false });

        assert.deepStrictEqual(addVersion.firstCall.args, [
            {
                bundle: analyzedBundle,
                ...buildOptions,
                version: '1.2.3',
                substitutionPublicModuleSourcePaths: undefined
            }
        ]);
    });

    test('tryBuildAndPublish() passes calculated attribution files to manual version providers', async function () {
        const providerInputs: unknown[] = [];
        const { processor } = createProcessor({ repositoryFolder: '/repo' });
        const analyzedBundle = createAnalyzedBundle();
        const buildOptions: BuildAndPublishOptions = {
            ...createBuildAndPublishOptions(),
            ignoredAttributionPaths: ['CHANGELOG.md'],
            versioning: {
                automatic: false,
                async provideVersion(input) {
                    providerInputs.push(input);
                    return '1.2.3';
                }
            }
        };

        const result = await processor.tryBuildAndPublish({
            analyzedBundle: {
                ...analyzedBundle,
                contents: [
                    createAnalyzedResource('/repo/source/index.js'),
                    createAnalyzedResource('/repo/docs/readme.md', 'readme.md')
                ]
            },
            buildOptions,
            stage: true
        });

        assert.deepStrictEqual(providerInputs, [
            {
                packageName: 'package-a',
                currentVersion: undefined,
                targetSourceFiles: ['docs/readme.md', 'package.json', 'source/index.js'],
                ignoredAttributionPaths: ['CHANGELOG.md'],
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                stage: true
            }
        ]);
        assert.strictEqual(result.bundle.version, '1.2.3');
    });

    test('tryBuildAndPublish() keeps the configured manual version without rebuilding on a rerun', async function () {
        const manualBundle = createVersionedBundle('package-a', '3.2.1');
        const { processor, increaseVersion, emit } = createProcessor({
            determineCurrentVersion: fake.resolves(Maybe.just('3.2.1')),
            addVersion: fake.returns(manualBundle)
        });

        const result = await processor.tryBuildAndPublish({
            analyzedBundle: createAnalyzedBundle(),
            buildOptions: {
                ...createBuildAndPublishOptions(),
                versioning: { automatic: false, version: '3.2.1' }
            },
            stage: false
        });

        assert.deepStrictEqual(result, {
            bundle: manualBundle,
            status: 'new-version',
            publication: noPublication,
            extraFiles: [],
            previousReleaseArtifacts: Maybe.nothing()
        });
        assert.strictEqual(increaseVersion.callCount, 0);
        assert.deepStrictEqual(getCallArgs(emit), [['building', { packageName: 'package-a', version: '3.2.1' }]]);
    });

    test('buildAndPublish() returns immediately when the package is already published', async function () {
        const publish = fake.resolves(undefined);
        const alreadyPublishedResult: BuildAndPublishResult = {
            bundle: createVersionedBundle(),
            status: 'already-published',
            publication: noPublication,
            extraFiles: [],
            previousReleaseArtifacts: Maybe.nothing()
        };
        const { processor, emit } = createProcessor({
            determineCurrentVersion: fake.resolves(Maybe.just('1.2.3')),
            addVersion: fake.returns(createVersionedBundle()),
            checkBundleAlreadyPublished: fake.resolves({
                alreadyPublishedAsLatest: true,
                previousReleaseArtifacts: Maybe.nothing()
            }),
            publish
        });

        const result = await processor.buildAndPublish({
            analyzedBundle: createAnalyzedBundle(),
            buildOptions: createBuildAndPublishOptions(),
            stage: false
        });

        assert.deepStrictEqual(result, alreadyPublishedResult);
        assert.strictEqual(publish.callCount, 0);
        assert.deepStrictEqual(getCallArgs(emit), [['building', { packageName: 'package-a', version: '1.2.3' }]]);
    });

    test('buildAndPublish() publishes the rebuilt bundle and emits publishing progress', async function () {
        const rebuiltBundle = createVersionedBundle('package-a', '1.2.4');
        const publish = fake.resolves(publishedToRegistry);
        const { processor, emit } = createProcessor({
            determineCurrentVersion: fake.resolves(Maybe.just('1.2.3')),
            addVersion: fake.returns(createVersionedBundle('package-a', '1.2.3')),
            increaseVersion: fake.returns(rebuiltBundle),
            publish
        });

        const options: DetermineVersionAndPublishOptions = {
            analyzedBundle: createAnalyzedBundle(),
            buildOptions: createBuildAndPublishOptions(),
            stage: false
        };
        const result = await processor.buildAndPublish(options);

        assert.deepStrictEqual(result, {
            bundle: rebuiltBundle,
            status: 'new-version',
            publication: publishedToRegistry,
            extraFiles: [],
            previousReleaseArtifacts: Maybe.nothing()
        });
        assert.deepStrictEqual(publish.firstCall.args, [
            {
                bundle: rebuiltBundle,
                registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
                publishSettings: { access: 'public', sbom: { enabled: false } },
                stage: false
            }
        ]);
        assert.deepStrictEqual(getCallArgs(emit), [
            ['building', { packageName: 'package-a', version: '1.2.3' }],
            ['rebuilding', { packageName: 'package-a', version: '1.2.3' }],
            ['publishing', { packageName: 'package-a', version: '1.2.4' }]
        ]);
    });

    test('buildAndPublish() returns a staged publication outcome when stage mode is enabled', async function () {
        const rebuiltBundle = createVersionedBundle('package-a', '1.2.4');
        const publish = fake.resolves(stagedForApproval('stage-123'));
        const { processor } = createProcessor({
            determineCurrentVersion: fake.resolves(Maybe.just('1.2.3')),
            addVersion: fake.returns(createVersionedBundle('package-a', '1.2.3')),
            increaseVersion: fake.returns(rebuiltBundle),
            publish
        });

        const result = await processor.buildAndPublish({
            analyzedBundle: createAnalyzedBundle(),
            buildOptions: createBuildAndPublishOptions(),
            stage: true
        });

        assert.deepStrictEqual(result.publication, stagedForApproval('stage-123'));
        assert.strictEqual((publish.firstCall.args[0] as { stage: boolean }).stage, true);
    });

    function setupSbomScenario(
        sbomResult: readonly { filePath: string; content: string; isExecutable: boolean }[] | undefined
    ): {
        readonly bundle: VersionedBundleWithManifest;
        readonly analyzedBundle: AnalyzedBundle;
        readonly generateSbom: SinonSpy;
        readonly checkBundleAlreadyPublished: SinonSpy;
        readonly processor: ReturnType<typeof createPackageProcessor>;
    } {
        const bundle = createVersionedBundle('package-a', '1.2.3');
        const analyzedBundle = createAnalyzedBundle();
        const generateSbom = fake.resolves(sbomResult);
        const checkBundleAlreadyPublished = fake.resolves({
            alreadyPublishedAsLatest: false,
            previousReleaseArtifacts: Maybe.nothing()
        });
        const { processor } = createProcessor({
            determineCurrentVersion: fake.resolves(Maybe.just('1.2.3')),
            addVersion: fake.returns(bundle),
            checkBundleAlreadyPublished,
            generateSbom
        });
        return { bundle, analyzedBundle, generateSbom, checkBundleAlreadyPublished, processor };
    }

    test('tryBuildAndPublish() invokes the sbomFileBuilder for the pre-bump bundle to feed the already-published check, then again for the post-bump bundle', async function () {
        const sbomFile = { filePath: 'sbom.cdx.json', content: '{"sbom":"stub"}', isExecutable: false };
        const { bundle, analyzedBundle, generateSbom, checkBundleAlreadyPublished, processor } = setupSbomScenario([
            sbomFile
        ]);

        const buildOptions: BuildAndPublishOptions = {
            ...createBuildAndPublishOptions(),
            publishSettings: { access: 'public', sbom: { enabled: true } }
        };
        await processor.tryBuildAndPublish({ analyzedBundle, buildOptions, stage: false });

        assert.strictEqual(generateSbom.callCount, 2);
        const expectedSiblings = [...buildOptions.bundleDependencies, ...buildOptions.bundlePeerDependencies];
        assert.deepStrictEqual(generateSbom.firstCall.args, [
            bundle,
            expectedSiblings,
            { access: 'public', sbom: { enabled: true } }
        ]);
        const secondCallBundle = generateSbom.secondCall.args[0] as VersionedBundleWithManifest;
        assert.strictEqual(secondCallBundle.version, '1.2.4');
        const checkArgs = checkBundleAlreadyPublished.firstCall.args[0] as { extraFiles: readonly unknown[] };
        assert.deepStrictEqual(checkArgs.extraFiles, [sbomFile]);
    });

    test('tryBuildAndPublish() omits extraFiles when sbomFileBuilder returns undefined', async function () {
        const { analyzedBundle, checkBundleAlreadyPublished, processor } = setupSbomScenario(undefined);

        await processor.tryBuildAndPublish({
            analyzedBundle,
            buildOptions: createBuildAndPublishOptions(),
            stage: false
        });

        const checkArgs = checkBundleAlreadyPublished.firstCall.args[0] as Record<string, unknown>;
        assert.strictEqual('extraFiles' in checkArgs, false);
    });

    test('resolveAndLink() emits scanCompleted with the resolved bundle scan results when subscribed', async function () {
        const hasSubscribers = fake((eventName: string) => {
            return eventName === 'scanCompleted';
        });
        const resolve = fake.resolves({
            name: 'package-a',
            contents: [{ fileDescription: { sourceFilePath: '/src/a.ts' } }],
            roots: { main: { js: createTransferableFile('/entry.js') } } as const,
            surface: { mode: 'implicit', defaultModuleRoot: 'main' } as const,
            externalDependencies: new Map([['lodash', { version: '^4' }]])
        });
        const { processor, emit } = createProcessor({ hasSubscribers, resolve });

        await processor.resolveAndLink(createResolveOptions());

        const scanCalls = getCallArgs(emit).filter((args) => {
            return args[0] === 'scanCompleted';
        });
        assert.strictEqual(scanCalls.length, 1);
        assert.deepStrictEqual(scanCalls[0], [
            'scanCompleted',
            {
                packageName: 'package-a',
                included: [{ path: '/src/a.ts', reason: 'reachable-from-entry' }],
                excluded: [{ specifier: 'lodash', reason: 'external-module' }]
            }
        ]);
    });

    test('resolveAndLink() does NOT emit scanCompleted when no subscriber is registered', async function () {
        const { processor, emit } = createProcessor();

        await processor.resolveAndLink(createResolveOptions());

        const scanCalls = getCallArgs(emit).filter((args) => {
            return args[0] === 'scanCompleted';
        });
        assert.strictEqual(scanCalls.length, 0);
    });

    test('resolveAndLink() emits linkingCompleted with the linker rewrites when subscribed', async function () {
        const hasSubscribers = fake((eventName: string) => {
            return eventName === 'linkingCompleted';
        });
        const linkBundle = fake.resolves({
            name: 'package-a',
            contents: [{ fileDescription: { sourceFilePath: '/src/a.ts' }, isSubstituted: true }],
            roots: { main: { js: createTransferableFile('/entry.js') } } as const,
            surface: { mode: 'implicit', defaultModuleRoot: 'main' } as const,
            linkedBundleDependencies: new Map([['pkg-b', {}]]),
            externalDependencies: new Map()
        });
        const { processor, emit } = createProcessor({ hasSubscribers, linkBundle });

        await processor.resolveAndLink(createResolveOptions());

        const linkingCalls = getCallArgs(emit).filter((args) => {
            return args[0] === 'linkingCompleted';
        });
        assert.strictEqual(linkingCalls.length, 1);
        assert.deepStrictEqual(linkingCalls[0], [
            'linkingCompleted',
            {
                packageName: 'package-a',
                rewrites: [
                    {
                        file: '/src/a.ts',
                        fromSpecifier: '/src/a.ts',
                        toSpecifier: 'pkg-b',
                        targetBundle: 'pkg-b'
                    }
                ]
            }
        ]);
    });

    test('resolveAndLink() does NOT emit linkingCompleted when no subscriber is registered', async function () {
        const { processor, emit } = createProcessor();

        await processor.resolveAndLink(createResolveOptions());

        const linkingCalls = getCallArgs(emit).filter((args) => {
            return args[0] === 'linkingCompleted';
        });
        assert.strictEqual(linkingCalls.length, 0);
    });

    function onlyVersionDeterminedSubscriber(): SinonSpy {
        return fake((eventName: string) => {
            return eventName === 'versionDetermined';
        });
    }

    function filterVersionDetermined(emit: SinonSpy): unknown[][] {
        return getCallArgs(emit).filter((args) => {
            return args[0] === 'versionDetermined';
        });
    }

    function expectSingleVersionDetermined(
        emit: SinonSpy,
        payload: {
            packageName: string;
            previousVersion: string | undefined;
            chosenVersion: string;
            trigger: 'auto-patch-bump' | 'initial' | 'minimum' | 'pinned';
        }
    ): void {
        assert.deepStrictEqual(filterVersionDetermined(emit), [['versionDetermined', payload]]);
    }

    test('tryBuildAndPublish() emits versionDetermined trigger "pinned" when first publish keeps the manual version', async function () {
        const manualBundle = createVersionedBundle('package-a', '4.5.6');
        const { processor, emit } = createProcessor({
            hasSubscribers: onlyVersionDeterminedSubscriber(),
            determineCurrentVersion: fake.resolves(Maybe.nothing()),
            addVersion: fake.returns(manualBundle)
        });

        await processor.tryBuildAndPublish({
            analyzedBundle: createAnalyzedBundle(),
            buildOptions: { ...createBuildAndPublishOptions(), versioning: { automatic: false, version: '4.5.6' } },
            stage: false
        });

        expectSingleVersionDetermined(emit, {
            packageName: 'package-a',
            previousVersion: undefined,
            chosenVersion: '4.5.6',
            trigger: 'pinned'
        });
    });

    test('tryBuildAndPublish() emits versionDetermined trigger "auto-patch-bump" on first auto publish without minimum', async function () {
        const initialBundle = createVersionedBundle('package-a', '0.0.0');
        const rebuiltBundle = createVersionedBundle('package-a', '0.0.1');
        const { processor, emit } = createProcessor({
            hasSubscribers: onlyVersionDeterminedSubscriber(),
            determineCurrentVersion: fake.resolves(Maybe.nothing()),
            addVersion: fake.returns(initialBundle),
            increaseVersion: fake.returns(rebuiltBundle)
        });

        await tryBuildAndPublishDefault(processor);

        expectSingleVersionDetermined(emit, {
            packageName: 'package-a',
            previousVersion: undefined,
            chosenVersion: '0.0.1',
            trigger: 'auto-patch-bump'
        });
    });

    test('tryBuildAndPublish() emits versionDetermined trigger "minimum" when minimumVersion is used as-is', async function () {
        const minimumVersionBundle = createVersionedBundle('package-a', '1.2.3');
        const { processor, emit } = createProcessor({
            hasSubscribers: onlyVersionDeterminedSubscriber(),
            determineCurrentVersion: fake.resolves(Maybe.nothing()),
            addVersion: fake.returns(minimumVersionBundle)
        });

        await processor.tryBuildAndPublish({
            analyzedBundle: createAnalyzedBundle(),
            buildOptions: {
                ...createBuildAndPublishOptions(),
                versioning: { automatic: true, minimumVersion: '1.2.3' }
            },
            stage: false
        });

        expectSingleVersionDetermined(emit, {
            packageName: 'package-a',
            previousVersion: undefined,
            chosenVersion: '1.2.3',
            trigger: 'minimum'
        });
    });

    test('tryBuildAndPublish() emits versionDetermined with the previousVersion for a rebuild on existing publication', async function () {
        const currentBundle = createVersionedBundle('package-a', '2.0.0');
        const rebuilt = createVersionedBundle('package-a', '2.0.1');
        const { processor, emit } = createProcessor({
            hasSubscribers: onlyVersionDeterminedSubscriber(),
            determineCurrentVersion: fake.resolves(Maybe.just('2.0.0')),
            addVersion: fake.returns(currentBundle),
            increaseVersion: fake.returns(rebuilt)
        });

        await tryBuildAndPublishDefault(processor);

        expectSingleVersionDetermined(emit, {
            packageName: 'package-a',
            previousVersion: '2.0.0',
            chosenVersion: '2.0.1',
            trigger: 'auto-patch-bump'
        });
    });

    test('tryBuildAndPublish() emits versionDetermined trigger "auto-patch-bump" without bump when current matches an automatic build', async function () {
        const initialBundle = createVersionedBundle('package-a', '2.0.0');
        const { processor, emit } = createProcessor({
            hasSubscribers: onlyVersionDeterminedSubscriber(),
            determineCurrentVersion: fake.resolves(Maybe.just('2.0.0')),
            addVersion: fake.returns(initialBundle),
            checkBundleAlreadyPublished: fake.resolves({
                alreadyPublishedAsLatest: true,
                previousReleaseArtifacts: Maybe.nothing()
            })
        });

        await tryBuildAndPublishDefault(processor);

        expectSingleVersionDetermined(emit, {
            packageName: 'package-a',
            previousVersion: '2.0.0',
            chosenVersion: '2.0.0',
            trigger: 'auto-patch-bump'
        });
    });

    test('tryBuildAndPublish() emits versionDetermined trigger "initial" when nothing is published and the bundle already matches', async function () {
        const initialBundle = createVersionedBundle('package-a', '0.0.0');
        const { processor, emit } = createProcessor({
            hasSubscribers: onlyVersionDeterminedSubscriber(),
            determineCurrentVersion: fake.resolves(Maybe.nothing()),
            addVersion: fake.returns(initialBundle),
            checkBundleAlreadyPublished: fake.resolves({
                alreadyPublishedAsLatest: true,
                previousReleaseArtifacts: Maybe.nothing()
            })
        });

        await tryBuildAndPublishDefault(processor);

        expectSingleVersionDetermined(emit, {
            packageName: 'package-a',
            previousVersion: undefined,
            chosenVersion: '0.0.0',
            trigger: 'initial'
        });
    });

    test('tryBuildAndPublish() does NOT emit versionDetermined when no subscriber is registered', async function () {
        const { processor, emit } = createProcessor({
            determineCurrentVersion: fake.resolves(Maybe.just('1.2.3')),
            addVersion: fake.returns(createVersionedBundle('package-a', '1.2.3')),
            checkBundleAlreadyPublished: fake.resolves({
                alreadyPublishedAsLatest: true,
                previousReleaseArtifacts: Maybe.nothing()
            })
        });

        await tryBuildAndPublishDefault(processor);

        assert.strictEqual(filterVersionDetermined(emit).length, 0);
    });

    test('buildAndPublish() forwards extraFiles from sbomFileBuilder to publish', async function () {
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
            analyzedBundle: createAnalyzedBundle(),
            buildOptions: { ...createBuildAndPublishOptions(), publishSettings: { access: 'public' } },
            stage: false
        };
        await processor.buildAndPublish(options);

        const publishArgs = publish.firstCall.args[0] as { extraFiles: readonly unknown[] };
        assert.deepStrictEqual(publishArgs.extraFiles, [
            { filePath: 'sbom.cdx.json', content: '{"sbom":"stub"}', isExecutable: false }
        ]);
    });
});
