import { fake, type SinonSpy } from 'sinon';
import { Maybe } from 'true-myth';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { LinkedBundle } from '../linker/linked-bundle.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import type { BuildAndPublishOptions, ResolveAndLinkOptions } from '../packtory/map-config.ts';
import { createPackageProcessor, type PackageProcessor } from '../packtory/package-processor.ts';

export type TransferableFile = {
    readonly sourceFilePath: string;
    readonly targetFilePath: string;
    readonly content: string;
    readonly isExecutable: boolean;
};

type VersionedBundleOverrides = {
    readonly dependencies?: Readonly<Record<string, string>>;
};

type EliminationInput = {
    readonly bundle: LinkedBundle;
};

export function createTransferableFile(filePath: string, targetFilePath = filePath.slice(1)): TransferableFile {
    return {
        sourceFilePath: filePath,
        targetFilePath,
        content: '',
        isExecutable: false
    };
}

export function createLinkedBundle(name = 'package-a'): LinkedBundle {
    return {
        name,
        contents: [],
        roots: { main: { js: createTransferableFile('/entry.js') } } as const,
        surface: { mode: 'implicit', defaultModuleRoot: 'main' } as const,
        linkedBundleDependencies: new Map(),
        externalDependencies: new Map()
    };
}

export function createAnalyzedBundle(name = 'package-a'): AnalyzedBundle {
    return {
        ...createLinkedBundle(name),
        contents: [],
        sideEffectsField: undefined
    };
}

export function createVersionedBundle(
    name = 'package-a',
    version = '1.2.3',
    overrides: VersionedBundleOverrides = {}
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
            ...overrides.dependencies !== undefined && { dependencies: overrides.dependencies }
        },
        manifestFile: { filePath: 'package.json', content: '{}', isExecutable: false }
    };
}

export type ProcessorOverrides = {
    readonly emit?: SinonSpy;
    readonly hasSubscribers?: SinonSpy;
    readonly resolve?: SinonSpy;
    readonly linkBundle?: SinonSpy;
    readonly determineCurrentVersion?: SinonSpy;
    readonly findCurrentHeadPublishedVersion?: SinonSpy;
    readonly addVersion?: SinonSpy;
    readonly increaseVersion?: SinonSpy;
    readonly checkBundleAlreadyPublished?: SinonSpy;
    readonly publish?: SinonSpy;
    readonly generateSbom?: SinonSpy;
    readonly eliminate?: SinonSpy;
    readonly repositoryFolder?: string;
};

export type ProcessorContext = {
    readonly processor: PackageProcessor;
    readonly emit: SinonSpy;
    readonly resolve: SinonSpy;
    readonly linkBundle: SinonSpy;
    readonly determineCurrentVersion: SinonSpy;
    readonly findCurrentHeadPublishedVersion: SinonSpy;
    readonly addVersion: SinonSpy;
    readonly increaseVersion: SinonSpy;
    readonly checkBundleAlreadyPublished: SinonSpy;
    readonly publish: SinonSpy;
    readonly generateSbom: SinonSpy;
};

type ProcessorSpies = {
    readonly emit: SinonSpy;
    readonly hasSubscribers: SinonSpy;
    readonly resolve: SinonSpy;
    readonly linkBundle: SinonSpy;
    readonly determineCurrentVersion: SinonSpy;
    readonly findCurrentHeadPublishedVersion: SinonSpy;
    readonly addVersion: SinonSpy;
    readonly increaseVersion: SinonSpy;
    readonly checkBundleAlreadyPublished: SinonSpy;
    readonly publish: SinonSpy;
    readonly generateSbom: SinonSpy;
    readonly eliminate: SinonSpy;
};

function providedSpy(provided: Readonly<SinonSpy> | undefined, fallback: SinonSpy): SinonSpy {
    return (provided ?? fallback) as SinonSpy;
}

function createDefaultProcessorSpies(): ProcessorSpies {
    return {
        emit: fake(),
        hasSubscribers: fake.returns(false),
        resolve: fake.resolves(createLinkedBundle()),
        linkBundle: fake.resolves(createLinkedBundle()),
        determineCurrentVersion: fake.resolves(Maybe.nothing()),
        findCurrentHeadPublishedVersion: fake.resolves(undefined),
        addVersion: fake.returns(createVersionedBundle()),
        increaseVersion: fake.returns(createVersionedBundle('package-a', '1.2.4')),
        checkBundleAlreadyPublished: fake.resolves({
            alreadyPublishedAsLatest: false,
            previousReleaseArtifacts: Maybe.nothing()
        }),
        publish: fake.resolves(undefined),
        generateSbom: fake.resolves(undefined),
        eliminate: fake(async function (eliminationInputs: readonly EliminationInput[]) {
            return eliminationInputs.map(function (input) {
                const bundle: AnalyzedBundle = { ...input.bundle, contents: [], sideEffectsField: undefined };
                return bundle;
            });
        })
    };
}

function createProcessorSpies(overrides: ProcessorOverrides): ProcessorSpies {
    const defaults = createDefaultProcessorSpies();
    return {
        emit: providedSpy(overrides.emit, defaults.emit),
        hasSubscribers: providedSpy(overrides.hasSubscribers, defaults.hasSubscribers),
        resolve: providedSpy(overrides.resolve, defaults.resolve),
        linkBundle: providedSpy(overrides.linkBundle, defaults.linkBundle),
        determineCurrentVersion: providedSpy(overrides.determineCurrentVersion, defaults.determineCurrentVersion),
        findCurrentHeadPublishedVersion: providedSpy(
            overrides.findCurrentHeadPublishedVersion,
            defaults.findCurrentHeadPublishedVersion
        ),
        addVersion: providedSpy(overrides.addVersion, defaults.addVersion),
        increaseVersion: providedSpy(overrides.increaseVersion, defaults.increaseVersion),
        checkBundleAlreadyPublished: providedSpy(
            overrides.checkBundleAlreadyPublished,
            defaults.checkBundleAlreadyPublished
        ),
        publish: providedSpy(overrides.publish, defaults.publish),
        generateSbom: providedSpy(overrides.generateSbom, defaults.generateSbom),
        eliminate: providedSpy(overrides.eliminate, defaults.eliminate)
    };
}

export function createProcessor(overrides: ProcessorOverrides = {}): ProcessorContext {
    const spies = createProcessorSpies(overrides);
    const dependencies = {
        progressBroadcaster: { emit: spies.emit, hasSubscribers: spies.hasSubscribers },
        resourceResolver: { resolve: spies.resolve },
        linker: { linkBundle: spies.linkBundle },
        bundleEmitter: {
            determineCurrentVersion: spies.determineCurrentVersion,
            findCurrentHeadPublishedVersion: spies.findCurrentHeadPublishedVersion,
            checkBundleAlreadyPublished: spies.checkBundleAlreadyPublished,
            publish: spies.publish
        },
        versionManager: { addVersion: spies.addVersion, increaseVersion: spies.increaseVersion },
        sbomFileBuilder: { generate: spies.generateSbom },
        deadCodeEliminator: { eliminate: spies.eliminate },
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
        emit: spies.emit,
        resolve: spies.resolve,
        linkBundle: spies.linkBundle,
        determineCurrentVersion: spies.determineCurrentVersion,
        findCurrentHeadPublishedVersion: spies.findCurrentHeadPublishedVersion,
        addVersion: spies.addVersion,
        increaseVersion: spies.increaseVersion,
        checkBundleAlreadyPublished: spies.checkBundleAlreadyPublished,
        publish: spies.publish,
        generateSbom: spies.generateSbom
    };
}

export function createResolveOptions(): ResolveAndLinkOptions {
    return {
        name: 'package-a',
        sourcesFolder: '/src',
        roots: { main: { js: '/src/index.js' } } as const,
        includeSourceMapFiles: true,
        additionalFiles: [ { sourceFilePath: '/src/readme.md', targetFilePath: 'readme.md' } ],
        mainPackageJson: { type: 'module' as const, dependencies: { dep: '^1.0.0' } },
        additionalChangelogSourceFiles: { packageFiles: [], sharedFiles: [] },
        additionalPackageJsonAttributes: { publishConfig: { access: 'public' } },
        allowMutableSpecifiers: [],
        bundleDependencies: [ createLinkedBundle('bundle-dependency') ],
        bundlePeerDependencies: [ createLinkedBundle('peer-dependency') ]
    };
}

export function createBuildAndPublishOptions(): BuildAndPublishOptions {
    return {
        ...createResolveOptions(),
        versioning: { automatic: true } as const,
        registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
        publishSettings: { access: 'public', sbom: { enabled: false } } as const,
        ignoredAttributionPaths: [],
        bundleDependencies: [ createVersionedBundle('bundle-dependency', '1.0.0') ],
        bundlePeerDependencies: [ createVersionedBundle('peer-dependency', '2.0.0') ]
    };
}

export function getCallArgs(spy: SinonSpy): unknown[][] {
    return spy.getCalls().map(function (call): unknown[] {
        return Array.from(call.args);
    });
}
