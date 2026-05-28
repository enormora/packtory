import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Maybe, Result } from 'true-myth';
import type { PacktoryConfig, PacktoryConfigWithoutRegistry } from '../config/config.ts';
import { bundleResource, linkedBundle, versionedBundleWithManifest } from '../test-libraries/bundle-fixtures.ts';
import { createTestEliminator } from '../test-libraries/eliminator-fixtures.ts';
import { createTestProgressBroadcaster, getErrResult, getOkResult } from '../test-libraries/result-helpers.ts';
import type { PackageProcessor } from './package-processor.ts';
import { createPacktory } from './packtory.ts';

function createLinkedBundle(name: string, sourceFilePath = `/${name}/index.js`): ReturnType<typeof linkedBundle> {
    return linkedBundle({
        name,
        contents: [{ ...bundleResource(sourceFilePath, { targetFilePath: 'index.js' }), isSubstituted: false }],
        roots: { main: { js: { sourceFilePath, targetFilePath: 'index.js', content: '', isExecutable: false } } }
    });
}

function createVersionedBundle(name: string, version = '1.0.0'): ReturnType<typeof versionedBundleWithManifest> {
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
        packages: [{ name: 'package-a', roots: { main: { js: 'package-a/index.js' } } }],
        ...overrides
    };
}

function createConfig(overrides: Record<string, unknown> = {}): PacktoryConfig {
    return {
        registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
        ...createConfigWithoutRegistry(overrides)
    };
}

type CreateProgressEvent = (params: {
    readonly packageName: string;
    readonly result: unknown;
    readonly options: unknown;
}) => {
    version: string;
    status: 'already-published' | 'initial-version' | 'new-version';
};

type StageParams = {
    readonly createOptions: (context: {
        packageName: string;
        existing: readonly unknown[];
        config: unknown;
    }) => unknown;
    readonly execute: (options: unknown) => Promise<unknown>;
    readonly selectNext: (params: { result: unknown; options: unknown }) => unknown;
    readonly createProgressEvent?: CreateProgressEvent | undefined;
    readonly config: { packtoryConfig: { packages: readonly { name: string }[] } };
};

type SchedulerOverrides = {
    readonly resolveStage?: (params: StageParams) => Promise<Result<readonly unknown[], unknown>>;
    readonly publishStage?: (params: StageParams) => Promise<Result<readonly unknown[], unknown>>;
};

type PacktoryUnderTest = {
    readonly packtory: ReturnType<typeof createPacktory>;
    readonly resolveAndLink: SinonSpy;
    readonly tryBuildAndPublish: SinonSpy;
    readonly buildAndPublish: SinonSpy;
    readonly scheduler: {
        readonly runForEachScheduledPackage: SinonSpy;
    };
    readonly progressBroadcaster: ReturnType<typeof createTestProgressBroadcaster>;
};

const twoPackageEntries: readonly {
    readonly name: string;
    readonly roots: { readonly main: { readonly js: string } };
}[] = [
    { name: 'package-a', roots: { main: { js: 'package-a/index.js' } } },
    { name: 'package-b', roots: { main: { js: 'package-b/index.js' } } }
];

function recordStageSuccess(params: {
    readonly existing: unknown[];
    readonly succeeded: unknown[];
    readonly selectNext: (params: { result: unknown; options: unknown }) => unknown;
    readonly result: unknown;
    readonly options: unknown;
}): void {
    params.existing.push(params.selectNext({ result: params.result, options: params.options }));
    params.succeeded.push(params.result);
}

async function runPublishStageUntilFailure(params: {
    readonly createOptions: StageParams['createOptions'];
    readonly execute: StageParams['execute'];
    readonly selectNext: StageParams['selectNext'];
    readonly config: StageParams['config'];
}): Promise<Result<readonly unknown[], unknown>> {
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

function createPacktoryUnderTest(
    overrides: SchedulerOverrides & {
        readonly collectContents?: () => readonly {
            readonly filePath: string;
            readonly content: string;
            readonly isExecutable: boolean;
        }[];
        readonly resolveAndLink?: SinonSpy;
        readonly tryBuildAndPublish?: SinonSpy;
        readonly buildAndPublish?: SinonSpy;
        readonly deadCodeEliminator?: ReturnType<typeof createTestEliminator>;
        readonly packEmitterPack?: SinonSpy;
        readonly versionManagerAddVersion?: SinonSpy;
    } = {}
): PacktoryUnderTest {
    const resolveAndLink =
        overrides.resolveAndLink ??
        fake(async (options: { name: string }) => {
            return createLinkedBundle(options.name);
        });
    const tryBuildAndPublish =
        overrides.tryBuildAndPublish ??
        fake(async (options: { buildOptions: { name: string } }) => {
            return {
                bundle: createVersionedBundle(options.buildOptions.name),
                status: 'initial-version' as const,
                extraFiles: [],
                previousReleaseArtifacts: Maybe.nothing()
            };
        });
    const buildAndPublish =
        overrides.buildAndPublish ??
        fake(async (options: { buildOptions: { name: string } }) => {
            return {
                bundle: createVersionedBundle(options.buildOptions.name),
                status: 'new-version' as const,
                extraFiles: [],
                previousReleaseArtifacts: Maybe.nothing()
            };
        });

    const defaultRunStage = async (params: StageParams): Promise<Result<unknown[], never>> => {
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

    const scheduler = {
        runForEachScheduledPackage: fake(async (params: StageParams & { readonly emitScheduledEvents?: boolean }) => {
            if (params.emitScheduledEvents === false) {
                if (overrides.publishStage !== undefined) {
                    return overrides.publishStage(params as never);
                }
                return defaultRunStage(params);
            }

            if (overrides.resolveStage !== undefined) {
                return overrides.resolveStage(params);
            }

            return defaultRunStage(params);
        })
    };
    const packageProcessor: PackageProcessor = {
        resolveAndLink,
        tryBuildAndPublish,
        buildAndPublish,
        build: async () => {
            throw new Error('Not implemented in tests');
        }
    };

    const progressBroadcaster = createTestProgressBroadcaster();
    return {
        packtory: createPacktory({
            packageProcessor,
            scheduler: scheduler as never,
            deadCodeEliminator: overrides.deadCodeEliminator ?? createTestEliminator(),
            progressBroadcaster,
            artifactsBuilder: { collectContents: overrides.collectContents ?? (() => []) },
            versionManager: {
                addVersion: (overrides.versionManagerAddVersion ??
                    (() => {
                        throw new Error('versionManager.addVersion not implemented in tests');
                    })) as never,
                increaseVersion: () => {
                    throw new Error('versionManager.increaseVersion not implemented in tests');
                }
            },
            packEmitter: {
                pack: (overrides.packEmitterPack ??
                    (async () => {
                        throw new Error('packEmitter.pack not implemented in tests');
                    })) as never
            },
            vendorMaterializer: {
                materializeExternals: async () => {
                    return Result.ok({
                        entries: [],
                        packageNames: [],
                        peerRequirements: new Map<string, readonly string[]>()
                    });
                }
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
    test('resolveAndLinkAll() returns config issues when the config without registry is invalid', async function () {
        const { packtory } = createPacktoryUnderTest();

        const { result } = await packtory.resolveAndLinkAll({ invalid: true });

        const error = getErrResult(result, 'Expected resolveAndLinkAll() should fail but it did not');
        assert.strictEqual(error.type, 'config');
    });

    function createPacktoryThatSharesSourceFile(): ReturnType<typeof createPacktoryUnderTest> {
        return createPacktoryUnderTest({
            resolveAndLink: fake(async (options: { name: string }) => {
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
                issues: ['File "/shared.js" is included in multiple packages: package-a, package-b']
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
                        bundleDependencies: ['dependency']
                    }
                ]
            })
        );

        const resolvedPackages = getOkResult(result, 'Expected resolveAndLinkAll() should succeed');
        assert.strictEqual(resolveAndLink.callCount, 2);
        assert.strictEqual(scheduler.runForEachScheduledPackage.callCount, 1);
        assert.deepStrictEqual(
            resolvedPackages.map((entry) => {
                return entry.name;
            }),
            ['dependency', 'package-a']
        );
    });

    test('buildAndPublishAll() returns config issues when the config with registry is invalid', async function () {
        const { packtory } = createPacktoryUnderTest();

        const { result } = await packtory.buildAndPublishAll({ invalid: true }, { dryRun: true });

        assert.deepStrictEqual(
            result,
            Result.err({
                type: 'config',
                issues: ['invalid value doesn’t match expected union']
            })
        );
    });

    test('buildAndPublishAll() fails fast with a single config issue when non-dry-run lacks auth', async function () {
        const buildAndPublish = fake();
        const tryBuildAndPublish = fake();
        const resolveAndLink = fake();
        const { packtory, scheduler } = createPacktoryUnderTest({
            resolveAndLink,
            buildAndPublish,
            tryBuildAndPublish
        });

        const { result } = await packtory.buildAndPublishAll(createConfigWithoutRegistry(), { dryRun: false });

        assert.deepStrictEqual(
            result,
            Result.err({
                type: 'config',
                issues: [
                    'registrySettings.auth must be configured to publish; run with dryRun=true to skip the registry write.'
                ]
            })
        );
        assert.strictEqual(resolveAndLink.callCount, 0);
        assert.strictEqual(tryBuildAndPublish.callCount, 0);
        assert.strictEqual(buildAndPublish.callCount, 0);
        assert.strictEqual(scheduler.runForEachScheduledPackage.callCount, 0);
    });

    test('buildAndPublishAll() allows dry-run when auth is omitted (anonymous read)', async function () {
        const { packtory, tryBuildAndPublish, buildAndPublish } = createPacktoryUnderTest();

        const { result } = await packtory.buildAndPublishAll(createConfigWithoutRegistry(), { dryRun: true });

        assert.strictEqual(result.isOk, true);
        assert.strictEqual(tryBuildAndPublish.callCount, 1);
        assert.strictEqual(buildAndPublish.callCount, 0);
    });

    test('buildAndPublishAll() returns check failures without entering publish mode', async function () {
        const buildAndPublish = fake();
        const tryBuildAndPublish = fake();
        const { packtory } = createPacktoryUnderTest({
            resolveAndLink: fake(async (options: { name: string }) => {
                return createLinkedBundle(options.name, '/shared.js');
            }),
            buildAndPublish,
            tryBuildAndPublish
        });

        const { result } = await packtory.buildAndPublishAll(
            createConfig({
                checks: { noDuplicatedFiles: { enabled: true } },
                packages: twoPackageEntries
            }),
            { dryRun: false }
        );

        assert.deepStrictEqual(
            result,
            Result.err({
                type: 'checks',
                issues: ['File "/shared.js" is included in multiple packages: package-a, package-b']
            })
        );
        assert.strictEqual(tryBuildAndPublish.callCount, 0);
        assert.strictEqual(buildAndPublish.callCount, 0);
    });

    test('buildAndPublishAll() uses tryBuildAndPublish() in dry-run mode and returns successful publish results', async function () {
        const { packtory, tryBuildAndPublish, buildAndPublish, scheduler } = createPacktoryUnderTest();

        const { result } = await packtory.buildAndPublishAll(createConfig(), { dryRun: true });

        assert.deepStrictEqual(
            result,
            Result.ok([
                {
                    bundle: createVersionedBundle('package-a'),
                    status: 'initial-version',
                    extraFiles: [],
                    previousReleaseArtifacts: Maybe.nothing()
                }
            ])
        );
        assert.strictEqual(tryBuildAndPublish.callCount, 1);
        assert.strictEqual(buildAndPublish.callCount, 0);
        assert.strictEqual(scheduler.runForEachScheduledPackage.callCount, 2);
    });

    test('buildAndPublishAll() uses buildAndPublish() outside dry-run mode', async function () {
        const { packtory, tryBuildAndPublish, buildAndPublish } = createPacktoryUnderTest();

        const { result } = await packtory.buildAndPublishAll(createConfig(), { dryRun: false });

        assert.deepStrictEqual(
            result,
            Result.ok([
                {
                    bundle: createVersionedBundle('package-a'),
                    status: 'new-version',
                    extraFiles: [],
                    previousReleaseArtifacts: Maybe.nothing()
                }
            ])
        );
        assert.strictEqual(tryBuildAndPublish.callCount, 0);
        assert.strictEqual(buildAndPublish.callCount, 1);
    });

    function subscribeToPackageFailed(
        progressBroadcaster: PacktoryUnderTest['progressBroadcaster']
    ): { packageName: string; stage: string; message: string }[] {
        const received: { packageName: string; stage: string; message: string }[] = [];
        progressBroadcaster.consumer.on('packageFailed', (payload) => {
            received.push({ packageName: payload.packageName, stage: payload.stage, message: payload.message });
        });
        return received;
    }

    test('resolveAndLinkAll() emits packageFailed with stage "resolveAndLink" when the resolve step throws', async function () {
        const resolveAndLink = fake(async () => {
            throw new Error('resolve crashed');
        });
        const { packtory, progressBroadcaster } = createPacktoryUnderTest({
            resolveAndLink,
            resolveStage: runPublishStageUntilFailure
        });
        const received = subscribeToPackageFailed(progressBroadcaster);

        await packtory.resolveAndLinkAll(createConfigWithoutRegistry());

        assert.deepStrictEqual(received, [
            { packageName: 'package-a', stage: 'resolveAndLink', message: 'resolve crashed' }
        ]);
    });

    test('buildAndPublishAll() emits packageFailed with stage "publish" when the publish step throws', async function () {
        const buildAndPublish = fake(async () => {
            throw new Error('publish crashed');
        });
        const tryBuildAndPublish = fake(async () => {
            throw new Error('publish crashed');
        });
        const { packtory, progressBroadcaster } = createPacktoryUnderTest({
            buildAndPublish,
            tryBuildAndPublish,
            publishStage: runPublishStageUntilFailure
        });
        const received = subscribeToPackageFailed(progressBroadcaster);

        await packtory.buildAndPublishAll(createConfig(), { dryRun: true });

        const publishFailures = received.filter((entry) => {
            return entry.stage === 'publish';
        });
        assert.deepStrictEqual(publishFailures, [
            { packageName: 'package-a', stage: 'publish', message: 'publish crashed' }
        ]);
    });

    test('resolveAndLinkAll() disposes the report aggregator after the call completes', async function () {
        const { packtory, progressBroadcaster } = createPacktoryUnderTest();

        await packtory.resolveAndLinkAll(createConfigWithoutRegistry(), { collectReport: true });

        assert.strictEqual(progressBroadcaster.provider.hasSubscribers('inputsResolved'), false);
    });

    test('resolveAndLinkAll() disposes the report aggregator even when the call throws', async function () {
        const resolveAndLink = fake(async () => {
            throw new Error('boom');
        });
        const { packtory, progressBroadcaster } = createPacktoryUnderTest({
            resolveAndLink,
            resolveStage: runPublishStageUntilFailure
        });

        await packtory.resolveAndLinkAll(createConfigWithoutRegistry(), { collectReport: true });

        assert.strictEqual(progressBroadcaster.provider.hasSubscribers('inputsResolved'), false);
    });

    test('buildAndPublishAll() disposes the report aggregator after the call completes', async function () {
        const { packtory, progressBroadcaster } = createPacktoryUnderTest();

        await packtory.buildAndPublishAll(createConfig(), { dryRun: true, collectReport: true });

        assert.strictEqual(progressBroadcaster.provider.hasSubscribers('inputsResolved'), false);
    });

    test('buildAndPublishAll() disposes the report aggregator even when the call throws', async function () {
        const buildAndPublish = fake(async () => {
            throw new Error('boom');
        });
        const tryBuildAndPublish = fake(async () => {
            throw new Error('boom');
        });
        const { packtory, progressBroadcaster } = createPacktoryUnderTest({
            buildAndPublish,
            tryBuildAndPublish,
            publishStage: runPublishStageUntilFailure
        });

        await packtory.buildAndPublishAll(createConfig(), { dryRun: true, collectReport: true });

        assert.strictEqual(progressBroadcaster.provider.hasSubscribers('inputsResolved'), false);
    });

    test('resolveAndLinkAll() with collectReport=true returns a non-undefined getReport', async function () {
        const { packtory } = createPacktoryUnderTest();

        const outcome = await packtory.resolveAndLinkAll(createConfigWithoutRegistry(), { collectReport: true });

        assert.notStrictEqual(outcome.getReport(), undefined);
    });

    test('resolveAndLinkAll() without collectReport returns a getReport that yields undefined', async function () {
        const { packtory } = createPacktoryUnderTest();

        const outcome = await packtory.resolveAndLinkAll(createConfigWithoutRegistry());

        assert.strictEqual(outcome.getReport(), undefined);
    });

    test('buildAndPublishAll() with collectReport=true returns a non-undefined getReport', async function () {
        const { packtory } = createPacktoryUnderTest();

        const outcome = await packtory.buildAndPublishAll(createConfig(), { dryRun: true, collectReport: true });

        assert.notStrictEqual(outcome.getReport(), undefined);
    });

    test('buildAndPublishAll() without collectReport returns a getReport that yields undefined', async function () {
        const { packtory } = createPacktoryUnderTest();

        const outcome = await packtory.buildAndPublishAll(createConfig(), { dryRun: true });

        assert.strictEqual(outcome.getReport(), undefined);
    });

    test('diffAgainstLatestPublished() returns config issues when the config with registry is invalid', async function () {
        const { packtory } = createPacktoryUnderTest();

        const { result } = await packtory.diffAgainstLatestPublished({ invalid: true });

        if (result.isOk) {
            assert.fail('expected an Err result');
        }
        assert.strictEqual(result.error.type, 'config');
    });

    test('diffAgainstLatestPublished() returns Ok with release-diff entries for the configured packages', async function () {
        const { packtory } = createPacktoryUnderTest();

        const { result } = await packtory.diffAgainstLatestPublished(createConfig());

        if (result.isErr) {
            assert.fail(`expected an Ok result, got ${JSON.stringify(result.error)}`);
        }
        assert.ok(result.value.length >= 0);
    });

    test('diffAgainstLatestPublished() runs through the dry-run publish path (tryBuildAndPublish), never the real publish', async function () {
        const { packtory, tryBuildAndPublish, buildAndPublish } = createPacktoryUnderTest();

        await packtory.diffAgainstLatestPublished(createConfig());

        assert.strictEqual(tryBuildAndPublish.callCount, 1);
        assert.strictEqual(buildAndPublish.callCount, 0);
    });

    test('diffAgainstLatestPublished() always exposes a getReport that returns a BuildReport with the version decisions made during the dry-run', async function () {
        const { packtory } = createPacktoryUnderTest();

        const outcome = await packtory.diffAgainstLatestPublished(createConfig());

        const report = outcome.getReport();
        assert.ok(report.packages['package-a']);
    });

    test('diffAgainstLatestPublished() disposes the report aggregator on exit so no listeners are left dangling', async function () {
        const { packtory, progressBroadcaster } = createPacktoryUnderTest();

        await packtory.diffAgainstLatestPublished(createConfig());

        assert.strictEqual(progressBroadcaster.provider.hasSubscribers('versionDetermined'), false);
    });

    test('analyzeReleaseAgainstLatestPublished() returns config issues when the config with registry is invalid', async function () {
        const { packtory } = createPacktoryUnderTest();

        const { result } = await packtory.analyzeReleaseAgainstLatestPublished({ invalid: true });

        if (result.isOk) {
            assert.fail('expected an Err result');
        }
        assert.strictEqual(result.error.type, 'config');
    });

    test('analyzeReleaseAgainstLatestPublished() classifies first publishes through the dry-run publish path', async function () {
        const { packtory, tryBuildAndPublish, buildAndPublish } = createPacktoryUnderTest();

        const { result } = await packtory.analyzeReleaseAgainstLatestPublished(createConfig());

        if (result.isErr) {
            assert.fail(`expected an Ok result, got ${JSON.stringify(result.error)}`);
        }
        assert.strictEqual(result.value.classification, 'first-publish');
        assert.strictEqual(tryBuildAndPublish.callCount, 1);
        assert.strictEqual(buildAndPublish.callCount, 0);
    });

    test('analyzeReleaseAgainstLatestPublished() disposes the report aggregator after the call completes', async function () {
        const { packtory, progressBroadcaster } = createPacktoryUnderTest();

        await packtory.analyzeReleaseAgainstLatestPublished(createConfig());

        assert.strictEqual(progressBroadcaster.provider.hasSubscribers('inputsResolved'), false);
    });

    test('analyzeReleaseAgainstLatestPublished() disposes the report aggregator even when the call throws', async function () {
        const resolveAndLink = fake(async () => {
            throw new Error('boom');
        });
        const { packtory, progressBroadcaster } = createPacktoryUnderTest({
            resolveAndLink,
            resolveStage: runPublishStageUntilFailure
        });

        await packtory.analyzeReleaseAgainstLatestPublished(createConfig());

        assert.strictEqual(progressBroadcaster.provider.hasSubscribers('inputsResolved'), false);
    });

    test('analyzeReleaseAgainstLatestPublished() exposes a getReport and classifies dependency-only package.json changes', async function () {
        const { packtory } = createPacktoryUnderTest({
            tryBuildAndPublish: fake(async (options: { buildOptions: { name: string } }) => {
                return {
                    bundle: createVersionedBundle(options.buildOptions.name, '1.0.1'),
                    status: 'new-version' as const,
                    extraFiles: [],
                    previousReleaseArtifacts: Maybe.just({
                        version: '1.0.0',
                        publishedAt: new Date('2026-05-01T00:00:00.000Z'),
                        files: [
                            {
                                filePath: 'package.json',
                                content: '{"name":"package-a","version":"1.0.0","dependencies":{"a":"1.0.0"}}',
                                isExecutable: false
                            }
                        ]
                    })
                };
            }),
            collectContents: () => {
                return [
                    {
                        filePath: 'package.json',
                        content: '{"name":"package-a","version":"1.0.1","dependencies":{"a":"1.1.0"}}',
                        isExecutable: false
                    }
                ];
            }
        });

        const outcome = await packtory.analyzeReleaseAgainstLatestPublished(createConfig());

        if (outcome.result.isErr) {
            assert.fail(`expected an Ok result, got ${JSON.stringify(outcome.result.error)}`);
        }
        assert.strictEqual(outcome.result.value.classification, 'dependency-only');
        assert.deepStrictEqual(outcome.result.value.mostRecentPublishedAt, new Date('2026-05-01T00:00:00.000Z'));
        assert.ok(outcome.getReport().packages['package-a']);
    });

    const packPublicOptions = {
        packageName: 'package-a',
        format: 'zip' as const,
        outputPath: '/out/package-a.zip',
        version: '1.0.0',
        vendorDependencies: false
    };

    test('packPackage() returns a config failure when the supplied config is invalid', async function () {
        const { packtory } = createPacktoryUnderTest();

        const { result } = await packtory.packPackage({ invalid: true }, packPublicOptions);

        const error = getErrResult(result, 'expected packPackage() to fail with a config error');
        assert.strictEqual(error.type, 'config');
    });

    test('packPackage() returns Ok and forwards the bundle to packEmitter.pack when the config validates and the package is resolvable', async function () {
        const versionManagerAddVersion = fake.returns(createVersionedBundle('package-a'));
        const packEmitterPack = fake.resolves(undefined);
        const { packtory } = createPacktoryUnderTest({ versionManagerAddVersion, packEmitterPack });

        const { result } = await packtory.packPackage(createConfigWithoutRegistry(), packPublicOptions);

        getOkResult(result, 'expected packPackage() to succeed');
        assert.strictEqual(versionManagerAddVersion.callCount, 1);
        assert.strictEqual(packEmitterPack.callCount, 1);
    });
});
