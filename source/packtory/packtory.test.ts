import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Maybe, Result } from 'true-myth';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import type { PacktoryConfigWithoutRegistry } from '../config/config.ts';
import {
    bundleResource,
    linkedBundle,
    versionedBundleWithManifest,
    type BundleFixtureLinkedBundle,
    type BundleFixtureVersionedBundleWithManifest
} from '../test-libraries/bundle-fixtures.ts';
import { createTestEliminator, type TestEliminator } from '../test-libraries/eliminator-fixtures.ts';
import {
    createTestProgressBroadcaster,
    type TestProgressBroadcaster,
    getErrResult,
    getOkResult
} from '../test-libraries/result-helpers.ts';
import { createPacktory, type Packtory } from './packtory.ts';

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
    readonly config: unknown;
};

type SelectNextInput = {
    readonly result: unknown;
    readonly options: unknown;
};

type PackageEntryConfig = {
    readonly name: string;
};

type SchedulerConfig = {
    readonly packtoryConfig: { readonly packages: readonly PackageEntryConfig[]; };
};

type TestProgressBroadcasterFixture = TestProgressBroadcaster;

type TestDeadCodeEliminator = TestEliminator;

type TestPackageProcessor = {
    readonly resolveAndLink: SinonSpy;
    readonly tryBuildAndPublish: SinonSpy;
    readonly buildAndPublish: SinonSpy;
    readonly build: () => Promise<never>;
};

type CollectContents = () => readonly {
    readonly filePath: string;
    readonly content: string;
    readonly isExecutable: boolean;
}[];

type ResolveOptionsInput = {
    readonly name: string;
};

type BuildOptionsInput = {
    readonly buildOptions: { readonly name: string; };
};

const noPublicationOutcome: Extract<PublicationOutcome, { readonly type: 'none'; }> = { type: 'none' };
const publishedOutcome: Extract<PublicationOutcome, { readonly type: 'published'; }> = { type: 'published' };

const releasePlanFileReader = {
    async checkReadability() {
        return { isReadable: true };
    },
    async readFile() {
        return '';
    }
};

function createLinkedBundle(name: string, sourceFilePath = `/${name}/index.js`): BundleFixtureLinkedBundle {
    return linkedBundle({
        name,
        contents: [ { ...bundleResource(sourceFilePath, { targetFilePath: 'index.js' }), isSubstituted: false } ],
        roots: { main: { js: { sourceFilePath, targetFilePath: 'index.js', content: '', isExecutable: false } } }
    });
}

function createVersionedBundle(name: string, version = '1.0.0'): BundleFixtureVersionedBundleWithManifest {
    return versionedBundleWithManifest({
        name,
        version,
        mainFile: { sourceFilePath: `/${name}/index.js`, targetFilePath: 'index.js' },
        packageJson: { name, version },
        manifestFile: { filePath: 'package.json', content: '{}' }
    });
}

function createConfigWithoutRegistry(overrides: Record<string, unknown> = {}): PacktoryConfigWithoutRegistry {
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

function createConfigWithRegistry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
        ...createConfigWithoutRegistry(),
        ...overrides
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

type PacktoryFactoryOverrides = SchedulerOverrides & {
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

type PacktoryUnderTest = {
    readonly packtory: Packtory;
    readonly resolveAndLink: SinonSpy;
    readonly tryBuildAndPublish: SinonSpy;
    readonly buildAndPublish: SinonSpy;
    readonly scheduler: {
        readonly runForEachScheduledPackage: SinonSpy;
    };
    readonly progressBroadcaster: TestProgressBroadcasterFixture;
};

type TestPackageEntry = {
    readonly name: string;
    readonly roots: { readonly main: { readonly js: string; }; };
};

const twoPackageEntries: readonly TestPackageEntry[] = [
    { name: 'package-a', roots: { main: { js: 'package-a/index.js' } } },
    { name: 'package-b', roots: { main: { js: 'package-b/index.js' } } }
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

function createPacktoryUnderTest(overrides: PacktoryFactoryOverrides = {}): PacktoryUnderTest {
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

suite('packtory', function () {
    suite('resolve', function () {
        test('resolveAndLinkAll() returns config issues when the config without registry is invalid', async function () {
            const { packtory } = createPacktoryUnderTest();

            const { result } = await packtory.resolveAndLinkAll({ invalid: true });

            const error = getErrResult(result, 'Expected resolveAndLinkAll() should fail but it did not');
            assert.strictEqual(error.type, 'config');
        });

        function createPacktoryThatSharesSourceFile(): PacktoryUnderTest {
            return createPacktoryUnderTest({
                resolveAndLink: fake(async function (options: ResolveOptionsInput) {
                    return createLinkedBundle(options.name, '/shared.js');
                })
            });
        }

        test('resolveAndLinkAll() returns check failures after the linked bundles were built', async function () {
            const { packtory } = createPacktoryThatSharesSourceFile();

            const { result } = await packtory.resolveAndLinkAll(
                createConfigWithoutRegistry({
                    checks: { noDuplicatedFiles: { enabled: true } },
                    packages: twoPackageEntries
                })
            );

            assert.deepStrictEqual(
                result,
                Result.err({
                    type: 'checks',
                    issues: [ 'File "/shared.js" is included in multiple packages: package-a, package-b' ]
                })
            );
        });

        test('resolveAndLinkAll() returns all resolved packages on success', async function () {
            const { packtory, resolveAndLink, scheduler } = createPacktoryUnderTest();

            const { result } = await packtory.resolveAndLinkAll(
                createConfigWithoutRegistry({
                    packages: [
                        { name: 'dependency', roots: { main: { js: 'dependency/index.js' } } },
                        {
                            name: 'package-a',
                            roots: { main: { js: 'package-a/index.js' } },
                            bundleDependencies: [ 'dependency' ]
                        }
                    ]
                })
            );

            const resolvedPackages = getOkResult(result, 'Expected resolveAndLinkAll() should succeed');
            assert.strictEqual(resolveAndLink.callCount, 2);
            assert.strictEqual(scheduler.runForEachScheduledPackage.callCount, 1);
            assert.deepStrictEqual(
                resolvedPackages.map(function (entry) {
                    return entry.name;
                }),
                [ 'dependency', 'package-a' ]
            );
        });
    });

    suite('facade operations', function () {
        suite('build and publish', function () {
            test('buildAndPublishAll() returns config issues when the config is invalid', async function () {
                const { packtory } = createPacktoryUnderTest();

                const { result } = await packtory.buildAndPublishAll({ invalid: true }, {
                    dryRun: true,
                    stage: false
                });

                const error = getErrResult(result, 'Expected buildAndPublishAll() should fail but it did not');
                assert.strictEqual(error.type, 'config');
            });

            test('buildAndPublishAll() rejects real publishes without registry auth', async function () {
                const { packtory } = createPacktoryUnderTest();

                const { result } = await packtory.buildAndPublishAll(createConfigWithoutRegistry(), {
                    dryRun: false,
                    stage: false
                });

                assert.deepStrictEqual(
                    getErrResult(result, 'Expected buildAndPublishAll() should fail but it did not'),
                    {
                        type: 'config',
                        issues: [
                            'registrySettings.auth must be configured to publish; run with dryRun=true to skip the registry write.'
                        ]
                    }
                );
            });

            test('buildAndPublishAll() allows dry runs without registry auth', async function () {
                const { packtory, tryBuildAndPublish } = createPacktoryUnderTest();

                const { result, getReport } = await packtory.buildAndPublishAll(createConfigWithoutRegistry(), {
                    dryRun: true,
                    stage: false,
                    collectReport: true
                });

                assert.strictEqual(getOkResult(result, 'Expected buildAndPublishAll() should succeed').length, 1);
                assert.strictEqual(tryBuildAndPublish.callCount, 1);
                assertDefined(getReport());
            });

            test('buildAndPublishAll() runs real publishes when registry auth is configured', async function () {
                const { packtory, buildAndPublish } = createPacktoryUnderTest();

                const { result } = await packtory.buildAndPublishAll(createConfigWithRegistry(), {
                    dryRun: false,
                    stage: false
                });

                assert.strictEqual(getOkResult(result, 'Expected buildAndPublishAll() should succeed').length, 1);
                assert.strictEqual(buildAndPublish.callCount, 1);
            });
        });

        suite('pack', function () {
            test('packPackage() returns config issues when the config is invalid', async function () {
                const { packtory } = createPacktoryUnderTest();

                const { result } = await packtory.packPackage(
                    { invalid: true },
                    {
                        packageName: 'package-a',
                        format: 'tar',
                        outputPath: '/out/package-a.tgz',
                        version: '1.0.0',
                        vendorDependencies: false
                    }
                );

                const error = getErrResult(result, 'Expected packPackage() should fail but it did not');
                assert.strictEqual(error.type, 'config');
            });

            test('packPackage() emits the requested package artifact on success', async function () {
                const packEmitterPack = fake.resolves(undefined);
                const versioned = createVersionedBundle('package-a');
                const { packtory } = createPacktoryUnderTest({
                    packEmitterPack,
                    versionManagerAddVersion: fake.returns(versioned)
                });

                const { result } = await packtory.packPackage(
                    createConfigWithoutRegistry(),
                    {
                        packageName: 'package-a',
                        format: 'tar',
                        outputPath: '/out/package-a.tgz',
                        version: '1.0.0',
                        vendorDependencies: false
                    }
                );

                getOkResult(result, 'Expected packPackage() should succeed');
                assert.deepStrictEqual(packEmitterPack.firstCall.args[0], {
                    bundle: versioned,
                    format: 'tar',
                    outputPath: '/out/package-a.tgz',
                    vendorEntries: [],
                    extraFiles: []
                });
            });
        });

        suite('reports', function () {
            test('diffAgainstLatestPublished() returns a required report and removes report subscribers', async function () {
                const { packtory, progressBroadcaster } = createPacktoryUnderTest();

                const { result, getReport } = await packtory.diffAgainstLatestPublished(createConfigWithRegistry());

                assert.strictEqual(
                    getOkResult(result, 'Expected diffAgainstLatestPublished() should succeed').length,
                    1
                );
                assertDefined(getReport());
                assert.strictEqual(progressBroadcaster.provider.hasSubscribers('done'), false);
            });

            test('diffAgainstLatestPublished() returns config issues when the config is invalid', async function () {
                const { packtory } = createPacktoryUnderTest();

                const { result } = await packtory.diffAgainstLatestPublished({ invalid: true });

                const error = getErrResult(result, 'Expected diffAgainstLatestPublished() should fail but it did not');
                assert.strictEqual(error.type, 'config');
            });

            test('analyzeReleaseAgainstLatestPublished() returns analysis with a required report', async function () {
                const { packtory, progressBroadcaster } = createPacktoryUnderTest();

                const { result, getReport } = await packtory.analyzeReleaseAgainstLatestPublished(
                    createConfigWithRegistry()
                );

                assert.strictEqual(
                    getOkResult(result, 'Expected analyzeReleaseAgainstLatestPublished() should succeed')
                        .classification,
                    'first-publish'
                );
                assertDefined(getReport());
                assert.strictEqual(progressBroadcaster.provider.hasSubscribers('done'), false);
            });

            test('analyzeReleaseAgainstLatestPublished() returns config issues when the config is invalid', async function () {
                const { packtory } = createPacktoryUnderTest();

                const { result } = await packtory.analyzeReleaseAgainstLatestPublished({ invalid: true });

                const error = getErrResult(
                    result,
                    'Expected analyzeReleaseAgainstLatestPublished() should fail but it did not'
                );
                assert.strictEqual(error.type, 'config');
            });

            test('planReleaseAgainstLatestPublished() returns a release plan with a required report', async function () {
                const { packtory, progressBroadcaster } = createPacktoryUnderTest();

                const { result, getReport } = await packtory.planReleaseAgainstLatestPublished(
                    createConfigWithRegistry()
                );

                assert.strictEqual(
                    getOkResult(result, 'Expected planReleaseAgainstLatestPublished() should succeed').packages.length,
                    1
                );
                assertDefined(getReport());
                assert.strictEqual(progressBroadcaster.provider.hasSubscribers('done'), false);
            });

            test('planReleaseAgainstLatestPublished() returns config issues when the config is invalid', async function () {
                const { packtory } = createPacktoryUnderTest();

                const { result } = await packtory.planReleaseAgainstLatestPublished({ invalid: true });

                const error = getErrResult(
                    result,
                    'Expected planReleaseAgainstLatestPublished() should fail but it did not'
                );
                assert.strictEqual(error.type, 'config');
            });
        });
    });
});
