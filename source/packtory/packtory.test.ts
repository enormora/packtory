import assert from 'node:assert';
import { test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Result } from 'true-myth';
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

// helpers re-exported for backwards compatibility within this module

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
        readonly resolveAndLink?: SinonSpy;
        readonly tryBuildAndPublish?: SinonSpy;
        readonly buildAndPublish?: SinonSpy;
        readonly deadCodeEliminator?: ReturnType<typeof createTestEliminator>;
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
            return { bundle: createVersionedBundle(options.buildOptions.name), status: 'initial-version' as const };
        });
    const buildAndPublish =
        overrides.buildAndPublish ??
        fake(async (options: { buildOptions: { name: string } }) => {
            return { bundle: createVersionedBundle(options.buildOptions.name), status: 'new-version' as const };
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
            progressBroadcaster
        }),
        resolveAndLink,
        tryBuildAndPublish,
        buildAndPublish,
        scheduler,
        progressBroadcaster
    };
}

test('resolveAndLinkAll() returns config issues when the config without registry is invalid', async () => {
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

test('resolveAndLinkAll() returns check failures after the linked bundles were built', async () => {
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

test('resolveAndLinkAll() returns all resolved packages on success', async () => {
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

test('buildAndPublishAll() returns config issues when the config with registry is invalid', async () => {
    const { packtory } = createPacktoryUnderTest();

    const { result } = await packtory.buildAndPublishAll({ invalid: true }, { dryRun: true });

    assert.deepStrictEqual(
        result,
        Result.err({
            type: 'config',
            issues: ['at registrySettings: missing property', 'invalid value doesn’t match expected union']
        })
    );
});

test('buildAndPublishAll() returns check failures without entering publish mode', async () => {
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

test('buildAndPublishAll() uses tryBuildAndPublish() in dry-run mode and returns successful publish results', async () => {
    const { packtory, tryBuildAndPublish, buildAndPublish, scheduler } = createPacktoryUnderTest();

    const { result } = await packtory.buildAndPublishAll(createConfig(), { dryRun: true });

    assert.deepStrictEqual(
        result,
        Result.ok([{ bundle: createVersionedBundle('package-a'), status: 'initial-version' }])
    );
    assert.strictEqual(tryBuildAndPublish.callCount, 1);
    assert.strictEqual(buildAndPublish.callCount, 0);
    assert.strictEqual(scheduler.runForEachScheduledPackage.callCount, 2);
});

test('buildAndPublishAll() uses buildAndPublish() outside dry-run mode', async () => {
    const { packtory, tryBuildAndPublish, buildAndPublish } = createPacktoryUnderTest();

    const { result } = await packtory.buildAndPublishAll(createConfig(), { dryRun: false });

    assert.deepStrictEqual(result, Result.ok([{ bundle: createVersionedBundle('package-a'), status: 'new-version' }]));
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

test('resolveAndLinkAll() emits packageFailed with stage "resolveAndLink" when the resolve step throws', async () => {
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

test('buildAndPublishAll() emits packageFailed with stage "publish" when the publish step throws', async () => {
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

test('resolveAndLinkAll() disposes the report aggregator after the call completes', async () => {
    const { packtory, progressBroadcaster } = createPacktoryUnderTest();

    await packtory.resolveAndLinkAll(createConfigWithoutRegistry(), { collectReport: true });

    assert.strictEqual(progressBroadcaster.provider.hasSubscribers('inputsResolved'), false);
});

test('resolveAndLinkAll() disposes the report aggregator even when the call throws', async () => {
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

test('buildAndPublishAll() disposes the report aggregator after the call completes', async () => {
    const { packtory, progressBroadcaster } = createPacktoryUnderTest();

    await packtory.buildAndPublishAll(createConfig(), { dryRun: true, collectReport: true });

    assert.strictEqual(progressBroadcaster.provider.hasSubscribers('inputsResolved'), false);
});

test('buildAndPublishAll() disposes the report aggregator even when the call throws', async () => {
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

test('resolveAndLinkAll() with collectReport=true returns a non-undefined getReport', async () => {
    const { packtory } = createPacktoryUnderTest();

    const outcome = await packtory.resolveAndLinkAll(createConfigWithoutRegistry(), { collectReport: true });

    assert.notStrictEqual(outcome.getReport(), undefined);
});

test('resolveAndLinkAll() without collectReport returns a getReport that yields undefined', async () => {
    const { packtory } = createPacktoryUnderTest();

    const outcome = await packtory.resolveAndLinkAll(createConfigWithoutRegistry());

    assert.strictEqual(outcome.getReport(), undefined);
});

test('buildAndPublishAll() with collectReport=true returns a non-undefined getReport', async () => {
    const { packtory } = createPacktoryUnderTest();

    const outcome = await packtory.buildAndPublishAll(createConfig(), { dryRun: true, collectReport: true });

    assert.notStrictEqual(outcome.getReport(), undefined);
});

test('buildAndPublishAll() without collectReport returns a getReport that yields undefined', async () => {
    const { packtory } = createPacktoryUnderTest();

    const outcome = await packtory.buildAndPublishAll(createConfig(), { dryRun: true });

    assert.strictEqual(outcome.getReport(), undefined);
});
