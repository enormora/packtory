import { fake, type SinonSpy } from 'sinon';
import { Maybe, Result } from 'true-myth';
import { createPacktory, type Packtory } from '../packtory/packtory.ts';
import {
    analyzedBundleResource,
    bundleResource,
    linkedBundle,
    versionedBundleWithManifest,
    type BundleFixtureLinkedBundle,
    type BundleFixtureVersionedBundleWithManifest
} from './bundle-fixtures.ts';
import { fakeCheckRunner } from './check-fixtures.ts';
import { createTestEliminator, type TestEliminator } from './eliminator-fixtures.ts';
import {
    createTestProgressBroadcaster,
    type TestProgressBroadcaster
} from './result-helpers.ts';

type PublicationOutcome = { readonly type: 'none'; } | { readonly type: 'published'; };

type ProgressEventInput = {
    readonly packageName: string;
    readonly result: unknown;
    readonly options: unknown;
};

type ProgressEvent = {
    readonly version: string;
    readonly status: 'already-published' | 'initial-version' | 'new-version';
    readonly publication: PublicationOutcome;
};

type StageResultList = readonly unknown[] & {
    readonly push: (value: unknown) => unknown;
};

type StageCreateOptionsInput = {
    readonly packageName: string;
    readonly existing: StageResultList;
    readonly configuration: unknown;
};

type SelectNextInput = {
    readonly result: unknown;
    readonly options: unknown;
};

type PackageEntryConfiguration = {
    readonly name: string;
};

type SchedulerConfiguration = {
    readonly packtoryConfiguration: { readonly packages: readonly PackageEntryConfiguration[]; };
};

type TestProgressBroadcasterFixture = TestProgressBroadcaster;

export type TestDeadCodeEliminator = TestEliminator;

type TestPackageProcessor = {
    readonly resolveAndLink: SinonSpy;
    readonly resolveAndLinkWithPromotedDeclarationCompanions: SinonSpy;
    readonly tryBuildAndPublish: SinonSpy;
    readonly buildAndPublish: SinonSpy;
    readonly publishPreparedPackage: SinonSpy;
    readonly build: () => Promise<never>;
};

type CollectContents = () => readonly {
    readonly filePath: string;
    readonly content: string;
    readonly isExecutable: boolean;
}[];

export type ResolveOptionsInput = {
    readonly name: string;
};

type BuildOptionsInput = {
    readonly buildOptions: { readonly name: string; };
};

const noPublicationOutcome: Extract<PublicationOutcome, { readonly type: 'none'; }> = { type: 'none' };

const publishedOutcome: Extract<PublicationOutcome, { readonly type: 'published'; }> = { type: 'published' };

const releasePlanFileReader = {
    async checkDirectory() {
        return { exists: false as const };
    },
    async checkReadability() {
        return { isReadable: true };
    },
    async readFile() {
        return '';
    }
};

export function createLinkedBundle(name: string, inputFilePath = `/${name}/index.js`): BundleFixtureLinkedBundle {
    return linkedBundle({
        name,
        contents: [ { ...bundleResource(inputFilePath, { targetFilePath: 'index.js' }), isSubstituted: false } ],
        roots: { main: { javaScript: { inputFilePath, targetFilePath: 'index.js', content: '', isExecutable: false } } }
    });
}

function createVersionedBundle(name: string, version = '1.0.0'): BundleFixtureVersionedBundleWithManifest {
    return versionedBundleWithManifest({
        name,
        version,
        mainFile: { inputFilePath: `/${name}/index.js`, targetFilePath: 'index.js' },
        packageManifest: { name, version },
        manifestFile: { filePath: 'package.json', content: '{}' }
    });
}

export function createConfigurationWithoutRegistry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        commonPackageSettings: {
            sourcesFolder: '/source',
            mainPackageManifest: { type: 'module' },
            publishSettings: { access: 'public' }
        },
        packages: [ { name: 'package-a', roots: { main: { javaScript: 'package-a/index.js' } } } ],
        ...overrides
    };
}

export function createConfigurationWithRegistry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        registrySettings: { authentication: { type: 'bearer-token', token: 'token' } },
        ...createConfigurationWithoutRegistry(),
        ...overrides
    };
}

type CreateProgressEvent = (input: ProgressEventInput) => ProgressEvent;

type StageInput = {
    readonly createOptions: (context: StageCreateOptionsInput) => unknown;
    readonly execute: (options: unknown) => Promise<unknown>;
    readonly selectNext: (input: SelectNextInput) => unknown;
    readonly createProgressEvent?: CreateProgressEvent | undefined;
    readonly configuration: SchedulerConfiguration;
};

type SchedulerOverrides = {
    readonly resolveStage?: (input: StageInput) => Promise<Result<readonly unknown[], unknown>>;
    readonly publishStage?: (input: StageInput) => Promise<Result<readonly unknown[], unknown>>;
};

export type PacktoryFactoryOverrides = SchedulerOverrides & {
    readonly collectContents?: CollectContents;
    readonly resolveAndLink?: SinonSpy;
    readonly tryBuildAndPublish?: SinonSpy;
    readonly buildAndPublish?: SinonSpy;
    readonly deadCodeEliminator?: TestDeadCodeEliminator;
    readonly packEmitterPack?: SinonSpy;
    readonly versionManagerAddVersion?: SinonSpy;
};

type ScheduledStageInput = StageInput & {
    readonly emitScheduledEvents?: boolean;
};

type DefaultRunStage = (input: StageInput) => Promise<Result<unknown[], never>>;

export type PacktoryUnderTest = {
    readonly packtory: Packtory;
    readonly resolveAndLink: SinonSpy;
    readonly tryBuildAndPublish: SinonSpy;
    readonly buildAndPublish: SinonSpy;
    readonly scheduler: {
        readonly runForEachScheduledPackage: SinonSpy;
    };
    readonly progressBroadcaster: TestProgressBroadcasterFixture;
};

export type TestPackageEntry = {
    readonly name: string;
    readonly roots: { readonly main: { readonly javaScript: string; }; };
};

export const twoPackageEntries: readonly TestPackageEntry[] = [
    { name: 'package-a', roots: { main: { javaScript: 'package-a/index.js' } } },
    { name: 'package-b', roots: { main: { javaScript: 'package-b/index.js' } } }
];

function fallback<TValue>(value: TValue | undefined, defaultValue: TValue): TValue {
    return value ?? defaultValue;
}

function createResolveAndLinkSpy(): SinonSpy {
    return fake(async function (options: ResolveOptionsInput) {
        return createLinkedBundle(options.name);
    });
}

function createTryBuildAndPublishSpy(): SinonSpy {
    return fake(async function (options: BuildOptionsInput) {
        return {
            bundle: createVersionedBundle(options.buildOptions.name),
            status: 'initial-version' as const,
            publication: noPublicationOutcome,
            extraFiles: [],
            previousReleaseArtifacts: Maybe.nothing()
        };
    });
}

function createBuildAndPublishSpy(): SinonSpy {
    return fake(async function (options: BuildOptionsInput) {
        return {
            bundle: createVersionedBundle(options.buildOptions.name),
            status: 'new-version' as const,
            publication: publishedOutcome,
            extraFiles: [],
            previousReleaseArtifacts: Maybe.nothing()
        };
    });
}

function createDefaultRunStage(): DefaultRunStage {
    return async function (input: StageInput): Promise<Result<unknown[], never>> {
        const existing: unknown[] = [];
        const results: unknown[] = [];

        for (const packageConfiguration of input.configuration.packtoryConfiguration.packages) {
            const options = input.createOptions({
                packageName: packageConfiguration.name,
                existing,
                configuration: input.configuration
            });
            const result = await input.execute(options);
            input.createProgressEvent?.({ packageName: packageConfiguration.name, result, options });
            existing.push(input.selectNext({ result, options }));
            results.push(result);
        }

        return Result.ok(results);
    };
}

async function runScheduledStage(
    input: ScheduledStageInput,
    overrides: SchedulerOverrides,
    defaultRunStage: DefaultRunStage
): Promise<Result<readonly unknown[], unknown>> {
    if (input.emitScheduledEvents === false) {
        return overrides.publishStage === undefined ? defaultRunStage(input) : overrides.publishStage(input);
    }
    return overrides.resolveStage === undefined ? defaultRunStage(input) : overrides.resolveStage(input);
}

export function createPacktoryUnderTest(overrides: PacktoryFactoryOverrides = {}): PacktoryUnderTest {
    const resolveAndLink = fallback(overrides.resolveAndLink, createResolveAndLinkSpy());
    const tryBuildAndPublish = fallback(overrides.tryBuildAndPublish, createTryBuildAndPublishSpy());
    const buildAndPublish = fallback(overrides.buildAndPublish, createBuildAndPublishSpy());
    const defaultRunStage = createDefaultRunStage();

    const scheduler = {
        runForEachScheduledPackage: fake(
            async function (input: ScheduledStageInput) {
                return runScheduledStage(input, overrides, defaultRunStage);
            }
        )
    };
    const packageProcessor: TestPackageProcessor = {
        resolveAndLink,
        resolveAndLinkWithPromotedDeclarationCompanions: resolveAndLink,
        tryBuildAndPublish,
        buildAndPublish,
        publishPreparedPackage: buildAndPublish,
        async build() {
            throw new Error('Not implemented in tests');
        }
    };

    const progressBroadcaster = createTestProgressBroadcaster();
    return {
        packtory: createPacktory({
            inspectSymbols: createTestEliminator().inspectSymbols,
            packageProcessor,
            scheduler: scheduler as never,
            deadCodeEliminator: fallback(overrides.deadCodeEliminator, createTestEliminator()),
            progressBroadcaster,
            artifactsBuilder: {
                collectContents: fallback(overrides.collectContents, function () {
                    return [];
                })
            },
            fileManager: releasePlanFileReader,
            repositoryFolder: '/',
            runChecks: fakeCheckRunner(),
            versionManager: {
                addVersion: fallback(
                    overrides.versionManagerAddVersion,
                    fake(function () {
                        throw new Error('versionManager.addVersion not implemented in tests');
                    })
                ) as never,
                increaseVersion() {
                    throw new Error('versionManager.increaseVersion not implemented in tests');
                }
            },
            packEmitter: {
                pack: fallback(
                    overrides.packEmitterPack,
                    fake(async function () {
                        throw new Error('packEmitter.pack not implemented in tests');
                    })
                ) as never
            },
            vendorMaterializer: {
                async materializeExternals() {
                    return Result.ok({
                        entries: [],
                        packageNames: [],
                        peerRequirements: new Map<string, readonly string[]>()
                    });
                }
            },
            async readCurrentGitHead() {
                return undefined;
            }
        }),
        resolveAndLink,
        tryBuildAndPublish,
        buildAndPublish,
        scheduler,
        progressBroadcaster
    };
}

export function createPureSideEffectsEliminator(): TestDeadCodeEliminator {
    return {
        async eliminate(inputs) {
            return inputs.map(function (input) {
                return {
                    ...input.bundle,
                    contents: [
                        analyzedBundleResource('/package-a/index.js', { targetFilePath: 'index.js' })
                    ],
                    sideEffectsField: false
                };
            });
        }
    };
}
