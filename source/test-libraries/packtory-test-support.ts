import { fake, type SinonSpy } from 'sinon';
import { Maybe, Result } from 'true-myth';
import type { PacktoryConfig, PacktoryConfigWithoutRegistry } from '../config/config.ts';
import { createPacktory, type Packtory } from '../packtory/packtory.ts';
import {
    bundleResource,
    linkedBundle,
    versionedBundleWithManifest,
    type BundleFixtureLinkedBundle,
    type BundleFixtureVersionedBundleWithManifest
} from './bundle-fixtures.ts';
import { createTestEliminator, type TestEliminator } from './eliminator-fixtures.ts';
import { createTestProgressBroadcaster, type TestProgressBroadcaster } from './result-helpers.ts';

export type PublicationOutcome = { readonly type: 'none'; } | { readonly type: 'published'; };
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
    readonly config: unknown;
};

type SelectNextInput = {
    readonly result: unknown;
    readonly options: unknown;
};

type PackageEntryConfig = {
    readonly name: string;
};

export type TestPackageEntry = {
    readonly name: string;
    readonly roots: { readonly main: { readonly js: string; }; };
};

type SchedulerConfig = {
    readonly packtoryConfig: { readonly packages: readonly PackageEntryConfig[]; };
};

type StageSuccessInput = {
    readonly existing: StageResultList;
    readonly succeeded: StageResultList;
    readonly selectNext: (params: SelectNextInput) => unknown;
    readonly result: unknown;
    readonly options: unknown;
};

export type PublishStageInput = {
    readonly createOptions: StageParams['createOptions'];
    readonly execute: StageParams['execute'];
    readonly selectNext: StageParams['selectNext'];
    readonly config: StageParams['config'];
};

type TestProgressBroadcasterFixture = TestProgressBroadcaster;

type TestDeadCodeEliminator = TestEliminator;

type TestPackageProcessor = {
    readonly resolveAndLink: SinonSpy;
    readonly tryBuildAndPublish: SinonSpy;
    readonly buildAndPublish: SinonSpy;
    readonly build: () => Promise<never>;
};

export type PackageFailedEvent = {
    readonly packageName: string;
    readonly stage: string;
    readonly message: string;
};

type CollectContents = () => readonly {
    readonly filePath: string;
    readonly content: string;
    readonly isExecutable: boolean;
}[];

export type ResolveOptionsInput = {
    readonly name: string;
};

export type BuildOptionsInput = {
    readonly buildOptions: { readonly name: string; };
};

export const noPublicationOutcome: Extract<PublicationOutcome, { readonly type: 'none'; }> = { type: 'none' };
export const publishedOutcome: Extract<PublicationOutcome, { readonly type: 'published'; }> = { type: 'published' };

const releasePlanFileReader = {
    async checkReadability() {
        return { isReadable: true };
    },
    async readFile() {
        return '';
    }
};

export const twoPackageEntries: readonly TestPackageEntry[] = [
    { name: 'package-a', roots: { main: { js: 'package-a/index.js' } } },
    { name: 'package-b', roots: { main: { js: 'package-b/index.js' } } }
];

export function createLinkedBundle(name: string, sourceFilePath = `/${name}/index.js`): BundleFixtureLinkedBundle {
    return linkedBundle({
        name,
        contents: [ { ...bundleResource(sourceFilePath, { targetFilePath: 'index.js' }), isSubstituted: false } ],
        roots: { main: { js: { sourceFilePath, targetFilePath: 'index.js', content: '', isExecutable: false } } }
    });
}

export function createVersionedBundle(name: string, version = '1.0.0'): BundleFixtureVersionedBundleWithManifest {
    return versionedBundleWithManifest({
        name,
        version,
        mainFile: { sourceFilePath: `/${name}/index.js`, targetFilePath: 'index.js' },
        packageJson: { name, version },
        manifestFile: { filePath: 'package.json', content: '{}' }
    });
}

export function createConfigWithoutRegistry(overrides: Record<string, unknown> = {}): PacktoryConfigWithoutRegistry {
    return {
        commonPackageSettings: {
            sourcesFolder: '/src',
            mainPackageJson: { type: 'module' },
            publishSettings: { access: 'public' }
        },
        packages: [ { name: 'package-a', roots: { main: { js: 'package-a/index.js' } } } ],
        ...overrides
    };
}

export function createConfig(overrides: Record<string, unknown> = {}): PacktoryConfig {
    return {
        registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
        ...createConfigWithoutRegistry(overrides)
    };
}

type CreateProgressEvent = (params: ProgressEventInput) => ProgressEvent;

type StageParams = {
    readonly createOptions: (context: StageCreateOptionsInput) => unknown;
    readonly execute: (options: unknown) => Promise<unknown>;
    readonly selectNext: (params: SelectNextInput) => unknown;
    readonly createProgressEvent?: CreateProgressEvent | undefined;
    readonly config: SchedulerConfig;
};

type SchedulerOverrides = {
    readonly resolveStage?: (params: StageParams) => Promise<Result<readonly unknown[], unknown>>;
    readonly publishStage?: (params: StageParams) => Promise<Result<readonly unknown[], unknown>>;
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

type ScheduledStageParams = StageParams & {
    readonly emitScheduledEvents?: boolean;
};

type DefaultRunStage = (params: StageParams) => Promise<Result<unknown[], never>>;

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

function recordStageSuccess(params: StageSuccessInput): void {
    params.existing.push(params.selectNext({ result: params.result, options: params.options }));
    params.succeeded.push(params.result);
}

export async function runPublishStageUntilFailure(
    params: PublishStageInput
): Promise<Result<readonly unknown[], unknown>> {
    const succeeded: unknown[] = [];
    const failures: Error[] = [];
    const existing: unknown[] = [];

    for (const packageConfig of params.config.packtoryConfig.packages) {
        const options = params.createOptions({
            packageName: packageConfig.name,
            existing,
            config: params.config
        });
        try {
            const result = await params.execute(options);
            recordStageSuccess({
                existing,
                succeeded,
                selectNext: params.selectNext,
                result,
                options
            });
        } catch (error: unknown) {
            failures.push(error as Error);
        }
    }

    return Result.err({ succeeded, failures });
}

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
    return async function (params: StageParams): Promise<Result<unknown[], never>> {
        const existing: unknown[] = [];
        const results: unknown[] = [];

        for (const packageConfig of params.config.packtoryConfig.packages) {
            const options = params.createOptions({
                packageName: packageConfig.name,
                existing,
                config: params.config
            });
            const result = await params.execute(options);
            params.createProgressEvent?.({ packageName: packageConfig.name, result, options });
            existing.push(params.selectNext({ result, options }));
            results.push(result);
        }

        return Result.ok(results);
    };
}

async function runScheduledStage(
    params: ScheduledStageParams,
    overrides: SchedulerOverrides,
    defaultRunStage: DefaultRunStage
): Promise<Result<readonly unknown[], unknown>> {
    if (params.emitScheduledEvents === false) {
        return overrides.publishStage === undefined ? defaultRunStage(params) : overrides.publishStage(params);
    }
    return overrides.resolveStage === undefined ? defaultRunStage(params) : overrides.resolveStage(params);
}

export function createPacktoryUnderTest(overrides: PacktoryFactoryOverrides = {}): PacktoryUnderTest {
    const resolveAndLink = fallback(overrides.resolveAndLink, createResolveAndLinkSpy());
    const tryBuildAndPublish = fallback(overrides.tryBuildAndPublish, createTryBuildAndPublishSpy());
    const buildAndPublish = fallback(overrides.buildAndPublish, createBuildAndPublishSpy());
    const defaultRunStage = createDefaultRunStage();

    const scheduler = {
        runForEachScheduledPackage: fake(
            async function (params: ScheduledStageParams) {
                return runScheduledStage(params, overrides, defaultRunStage);
            }
        )
    };
    const packageProcessor: TestPackageProcessor = {
        resolveAndLink,
        tryBuildAndPublish,
        buildAndPublish,
        async build() {
            throw new Error('Not implemented in tests');
        }
    };

    const progressBroadcaster = createTestProgressBroadcaster();
    return {
        packtory: createPacktory({
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
