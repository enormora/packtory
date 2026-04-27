/* eslint-disable max-statements, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/consistent-type-assertions, prettier/prettier -- these orchestrator tests use broad inline fixtures to cover public control flow directly */
import assert from 'node:assert';
import { test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Result } from 'true-myth';
import type { PacktoryConfig, PacktoryConfigWithoutRegistry } from '../config/config.ts';
import type { LinkedBundle } from '../linker/linked-bundle.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import {
    createPacktory,
    type PublishAllResult,
    type ResolveAndLinkAllResult,
    type ResolvedPackage
} from './packtory.ts';

function createLinkedBundle(name: string, sourceFilePath = `/${name}/index.js`): LinkedBundle {
    return {
        name,
        contents: [
            {
                fileDescription: {
                    sourceFilePath,
                    targetFilePath: 'index.js',
                    content: '',
                    isExecutable: false
                },
                directDependencies: new Set<string>(),
                isSubstituted: false,
                isExplicitlyIncluded: false
            }
        ],
        entryPoints: [
            {
                js: {
                    sourceFilePath,
                    targetFilePath: 'index.js',
                    content: '',
                    isExecutable: false
                }
            }
        ] as const,
        linkedBundleDependencies: new Map(),
        externalDependencies: new Map()
    };
}

function createVersionedBundle(name: string, version = '1.0.0'): VersionedBundleWithManifest {
    return {
        name,
        version,
        contents: [],
        dependencies: {},
        peerDependencies: {},
        additionalAttributes: {},
        mainFile: {
            sourceFilePath: `/${name}/index.js`,
            targetFilePath: 'index.js',
            content: '',
            isExecutable: false
        },
        packageType: 'module' as const,
        packageJson: { name, version },
        manifestFile: { filePath: 'package.json', content: '{}', isExecutable: false }
    };
}

function createConfigWithoutRegistry(
    overrides: Record<string, unknown> = {}
): PacktoryConfigWithoutRegistry {
    return {
        commonPackageSettings: {
            sourcesFolder: '/src',
            mainPackageJson: { type: 'module' }
        },
        packages: [{ name: 'package-a', entryPoints: [{ js: 'package-a/index.js' }] }],
        ...overrides
    };
}

function createConfig(overrides: Record<string, unknown> = {}): PacktoryConfig {
    return {
        registrySettings: { token: 'token' },
        ...createConfigWithoutRegistry(overrides)
    };
}

type SchedulerOverrides = {
    readonly resolveStage?: (params: {
        readonly createOptions: (context: unknown) => unknown;
        readonly execute: (options: unknown) => Promise<unknown>;
        readonly selectNext: (params: { result: unknown; options: unknown }) => unknown;
        readonly config: { packtoryConfig: { packages: readonly { name: string }[] } };
    }) => Promise<PublishAllResult | ResolveAndLinkAllResult | Result<readonly unknown[], unknown>>;
    readonly publishStage?: (params: {
        readonly createOptions: (context: unknown) => unknown;
        readonly execute: (options: unknown) => Promise<unknown>;
        readonly selectNext: (params: { result: unknown; options: unknown }) => unknown;
        readonly config: { packtoryConfig: { packages: readonly { name: string }[] } };
        readonly createProgressEvent?:
            | ((params: { packageName: string; result: unknown; options: unknown }) => {
                version: string;
                status: 'already-published' | 'initial-version' | 'new-version';
            })
            | undefined;
    }) => Promise<Result<readonly unknown[], unknown>>;
};

type PacktoryUnderTest = {
    readonly packtory: ReturnType<typeof createPacktory>;
    readonly resolveAndLink: SinonSpy;
    readonly tryBuildAndPublish: SinonSpy;
    readonly buildAndPublish: SinonSpy;
    readonly scheduler: {
        readonly runForEachScheduledPackage: SinonSpy;
    };
};

function createPacktoryUnderTest(
    overrides: SchedulerOverrides & {
        readonly resolveAndLink?: SinonSpy;
        readonly tryBuildAndPublish?: SinonSpy;
        readonly buildAndPublish?: SinonSpy;
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

    const defaultRunStage = async (params: {
        readonly createOptions: (context: {
            packageName: string;
            existing: readonly unknown[];
            config: unknown;
        }) => unknown;
        readonly execute: (options: unknown) => Promise<unknown>;
        readonly selectNext: (params: { result: unknown; options: unknown }) => unknown;
        readonly createProgressEvent?:
            | ((params: { packageName: string; result: unknown; options: unknown }) => {
                version: string;
                status: 'already-published' | 'initial-version' | 'new-version';
            })
            | undefined;
        readonly config: { packtoryConfig: { packages: readonly { name: string }[] } };
    }): Promise<Result<unknown[], never>> => {
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
        runForEachScheduledPackage: fake(
            async (params: {
                readonly emitScheduledEvents?: boolean;
                readonly createOptions: (context: {
                    packageName: string;
                    existing: readonly unknown[];
                    config: unknown;
                }) => unknown;
                readonly execute: (options: unknown) => Promise<unknown>;
                readonly selectNext: (params: { result: unknown; options: unknown }) => unknown;
                readonly createProgressEvent?:
                    | ((params: { packageName: string; result: unknown; options: unknown }) => {
                        version: string;
                        status: 'already-published' | 'initial-version' | 'new-version';
                    })
                    | undefined;
                readonly config: { packtoryConfig: { packages: readonly { name: string }[] } };
            }) => {
                if (params.emitScheduledEvents === false) {
                    if (overrides.publishStage !== undefined) {
                        return overrides.publishStage(params as never);
                    }
                    return defaultRunStage(params);
                }

                if (overrides.resolveStage !== undefined) {
                    return overrides.resolveStage(params as never);
                }

                return defaultRunStage(params);
            }
        )
    };

    return {
        packtory: createPacktory({
            packageProcessor: {
                resolveAndLink,
                tryBuildAndPublish,
                buildAndPublish
            } as never,
            scheduler: scheduler as never
        }),
        resolveAndLink,
        tryBuildAndPublish,
        buildAndPublish,
        scheduler
    };
}

test('resolveAndLinkAll() returns config issues when the config without registry is invalid', async () => {
    const { packtory } = createPacktoryUnderTest();

    const result = await packtory.resolveAndLinkAll({ invalid: true });

    assert.strictEqual(result.isErr, true);
    if (result.isOk) {
        assert.fail('Expected resolveAndLinkAll() should fail but it did not');
    }
    assert.strictEqual(result.error.type, 'config');
});

test('resolveAndLinkAll() returns partial scheduler failures', async () => {
    const { packtory } = createPacktoryUnderTest({
        resolveStage: async () => {
            return Result.err({ succeeded: [], failures: [new Error('resolve failed')] });
        }
    });

    const result = await packtory.resolveAndLinkAll(createConfigWithoutRegistry());

    assert.deepStrictEqual(
        result,
        Result.err({
            type: 'partial',
            error: { succeeded: [], failures: [new Error('resolve failed')] }
        })
    );
});

test('resolveAndLinkAll() returns check failures after the linked bundles were built', async () => {
    const { packtory } = createPacktoryUnderTest({
        resolveAndLink: fake(async (options: { name: string }) => {
            return createLinkedBundle(options.name, '/shared.js');
        })
    });

    const result = await packtory.resolveAndLinkAll(
        createConfigWithoutRegistry({
            checks: { noDuplicatedFiles: { enabled: true } },
            packages: [
                { name: 'package-a', entryPoints: [{ js: 'package-a/index.js' }] },
                { name: 'package-b', entryPoints: [{ js: 'package-b/index.js' }] }
            ]
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

    const result = await packtory.resolveAndLinkAll(
        createConfigWithoutRegistry({
            packages: [
                { name: 'dependency', entryPoints: [{ js: 'dependency/index.js' }] },
                {
                    name: 'package-a',
                    entryPoints: [{ js: 'package-a/index.js' }],
                    bundleDependencies: ['dependency']
                }
            ]
        })
    );

    assert.strictEqual(result.isOk, true);
    if (result.isErr) {
        assert.fail('Expected resolveAndLinkAll() should succeed');
    }
    assert.strictEqual(resolveAndLink.callCount, 2);
    assert.strictEqual(scheduler.runForEachScheduledPackage.callCount, 1);
    assert.deepStrictEqual(
        result.value.map((entry) => {
            return entry.name;
        }),
        ['dependency', 'package-a']
    );
});

test('buildAndPublishAll() returns config issues when the config with registry is invalid', async () => {
    const { packtory } = createPacktoryUnderTest();

    const result = await packtory.buildAndPublishAll({ invalid: true }, { dryRun: true });

    assert.deepStrictEqual(
        result,
        Result.err({
            type: 'config',
            issues: ['at registrySettings: missing property', 'invalid value doesn’t match expected union']
        })
    );
});

test('buildAndPublishAll() converts resolve-stage partial failures into a partial publish result with no succeeded items', async () => {
    const { packtory } = createPacktoryUnderTest({
        resolveStage: async () => {
            return Result.err({
                succeeded: [createLinkedBundle('package-a')],
                failures: [new Error('resolve failed')]
            });
        }
    });

    const result = await packtory.buildAndPublishAll(createConfig(), { dryRun: true });

    assert.deepStrictEqual(
        result,
        Result.err({
            type: 'partial',
            succeeded: [],
            failures: [new Error('resolve failed')]
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

    const result = await packtory.buildAndPublishAll(
        createConfig({
            checks: { noDuplicatedFiles: { enabled: true } },
            packages: [
                { name: 'package-a', entryPoints: [{ js: 'package-a/index.js' }] },
                { name: 'package-b', entryPoints: [{ js: 'package-b/index.js' }] }
            ]
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

    const result = await packtory.buildAndPublishAll(createConfig(), { dryRun: true });

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

    const result = await packtory.buildAndPublishAll(createConfig(), { dryRun: false });

    assert.deepStrictEqual(result, Result.ok([{ bundle: createVersionedBundle('package-a'), status: 'new-version' }]));
    assert.strictEqual(tryBuildAndPublish.callCount, 0);
    assert.strictEqual(buildAndPublish.callCount, 1);
});

test('buildAndPublishAll() returns partial publish failures from the publish stage', async () => {
    const { packtory } = createPacktoryUnderTest({
        publishStage: async () => {
            return Result.err({
                succeeded: [{ bundle: createVersionedBundle('package-a'), status: 'initial-version' as const }],
                failures: [new Error('publish failed')]
            });
        }
    });

    const result = await packtory.buildAndPublishAll(createConfig(), { dryRun: true });

    assert.deepStrictEqual(
        result,
        Result.err({
            type: 'partial',
            succeeded: [{ bundle: createVersionedBundle('package-a'), status: 'initial-version' }],
            failures: [new Error('publish failed')]
        })
    );
});

test('buildAndPublishAll() returns a partial failure when a linked bundle is missing for a later package', async () => {
    const resolvedPackage = {
        name: 'package-a',
        linkedBundle: createLinkedBundle('package-a'),
        resolveOptions: {
            name: 'package-a',
            sourcesFolder: '/src',
            entryPoints: [{ js: '/src/package-a/index.js' }] as const,
            includeSourceMapFiles: false,
            additionalFiles: [],
            moduleResolution: 'module' as const,
            mainPackageJson: { type: 'module' as const },
            additionalPackageJsonAttributes: {},
            bundleDependencies: [],
            bundlePeerDependencies: []
        }
    } satisfies ResolvedPackage;

    const { packtory } = createPacktoryUnderTest({
        resolveStage: async () => {
            return Result.ok([resolvedPackage]);
        },
        publishStage: async (params) => {
            const packageNames = params.config.packtoryConfig.packages.map((packageConfig) => {
                return packageConfig.name;
            });
            const succeeded: unknown[] = [];
            const failures: Error[] = [];
            const existing: unknown[] = [];

            for (const packageName of packageNames) {
                const options = params.createOptions({ packageName, existing, config: params.config });
                try {
                    const result = await params.execute(options);
                    existing.push(params.selectNext({ result, options }));
                    succeeded.push(result);
                } catch (error: unknown) {
                    failures.push(error as Error);
                }
            }

            return Result.err({ succeeded, failures });
        }
    });

    const result = await packtory.buildAndPublishAll(
        createConfig({
            packages: [
                { name: 'package-a', entryPoints: [{ js: 'package-a/index.js' }] },
                { name: 'package-b', entryPoints: [{ js: 'package-b/index.js' }] }
            ]
        }),
        { dryRun: false }
    );

    assert.deepStrictEqual(
        result,
        Result.err({
            type: 'partial',
            succeeded: [{ bundle: createVersionedBundle('package-a'), status: 'new-version' }],
            failures: [new Error('Linked bundle for package "package-b" is missing')]
        })
    );
});
