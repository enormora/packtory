import assert from 'node:assert';
import { test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Result } from 'true-myth';
import type { PacktoryConfig, PacktoryConfigWithoutRegistry } from '../config/config.ts';
import { createDeadCodeEliminator } from '../dead-code-eliminator/eliminator.ts';
import { bundleResource, linkedBundle, versionedBundleWithManifest } from '../test-libraries/bundle-fixtures.ts';
import { getErrResult, getOkResult } from '../test-libraries/result-helpers.ts';
import type { PackageProcessor } from './package-processor.ts';
import { createPacktory, type PublishAllResult, type ResolveAndLinkAllResult } from './packtory.ts';

type AnalyzedBundle = Awaited<ReturnType<ReturnType<typeof createDeadCodeEliminator>['eliminate']>>[number];

function createLinkedBundle(name: string, sourceFilePath = `/${name}/index.js`): ReturnType<typeof linkedBundle> {
    return linkedBundle({
        name,
        contents: [{ ...bundleResource(sourceFilePath, { targetFilePath: 'index.js' }), isSubstituted: false }],
        entryPoints: [{ js: { sourceFilePath, targetFilePath: 'index.js', content: '', isExecutable: false } }]
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
        packages: [{ name: 'package-a', entryPoints: [{ js: 'package-a/index.js' }] }],
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
        readonly createProgressEvent?: CreateProgressEvent | undefined;
    }) => Promise<Result<readonly unknown[], unknown>>;
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

type PacktoryUnderTest = {
    readonly packtory: ReturnType<typeof createPacktory>;
    readonly resolveAndLink: SinonSpy;
    readonly tryBuildAndPublish: SinonSpy;
    readonly buildAndPublish: SinonSpy;
    readonly scheduler: {
        readonly runForEachScheduledPackage: SinonSpy;
    };
};

// helpers re-exported for backwards compatibility within this module

const twoPackageEntries: readonly {
    readonly name: string;
    readonly entryPoints: readonly { readonly js: string }[];
}[] = [
    { name: 'package-a', entryPoints: [{ js: 'package-a/index.js' }] },
    { name: 'package-b', entryPoints: [{ js: 'package-b/index.js' }] }
];

function partialResolveFailure(packageName: string): {
    readonly succeeded: ReturnType<typeof createLinkedBundle>[];
    readonly failures: Error[];
} {
    return {
        succeeded: [createLinkedBundle(packageName)],
        failures: [new Error('resolve failed')]
    };
}

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
    readonly createOptions: (context: unknown) => unknown;
    readonly execute: (options: unknown) => Promise<unknown>;
    readonly selectNext: (params: { result: unknown; options: unknown }) => unknown;
    readonly config: { packtoryConfig: { packages: readonly { name: string }[] } };
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
        readonly deadCodeEliminator?: ReturnType<typeof createDeadCodeEliminator>;
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
                return overrides.resolveStage(params as never);
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

    return {
        packtory: createPacktory({
            packageProcessor,
            scheduler: scheduler as never,
            deadCodeEliminator: overrides.deadCodeEliminator ?? createDeadCodeEliminator()
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

    const error = getErrResult(result, 'Expected resolveAndLinkAll() should fail but it did not');
    assert.strictEqual(error.type, 'config');
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

function createPacktoryThatSharesSourceFile(): ReturnType<typeof createPacktoryUnderTest> {
    return createPacktoryUnderTest({
        resolveAndLink: fake(async (options: { name: string }) => {
            return createLinkedBundle(options.name, '/shared.js');
        })
    });
}

test('resolveAndLinkAll() returns check failures after the linked bundles were built', async () => {
    const { packtory } = createPacktoryThatSharesSourceFile();

    const result = await packtory.resolveAndLinkAll(
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

test('resolveAndLinkAll() threads per-package noDuplicatedFiles consent through the runner', async () => {
    const { packtory } = createPacktoryThatSharesSourceFile();

    const result = await packtory.resolveAndLinkAll(
        createConfigWithoutRegistry({
            checks: { noDuplicatedFiles: { enabled: true } },
            packages: twoPackageEntries.map((entry) => {
                return {
                    ...entry,
                    checks: { noDuplicatedFiles: { allowList: ['/shared.js'] } }
                };
            })
        })
    );

    assert.strictEqual(result.isOk, true);
});

test('resolveAndLinkAll() exposes packageConfig.bundleDependencies to noUnusedBundleDependencies', async () => {
    const { packtory } = createPacktoryUnderTest({
        resolveAndLink: fake(async (options: { name: string }) => {
            return createLinkedBundle(options.name);
        })
    });

    const result = await packtory.resolveAndLinkAll(
        createConfigWithoutRegistry({
            checks: { noUnusedBundleDependencies: { enabled: true } },
            packages: [
                { name: 'package-b', entryPoints: [{ js: 'package-b/index.js' }] },
                {
                    name: 'package-a',
                    entryPoints: [{ js: 'package-a/index.js' }],
                    bundleDependencies: ['package-b']
                }
            ]
        })
    );

    assert.deepStrictEqual(
        result,
        Result.err({
            type: 'checks',
            issues: ['Unused bundle dependency "package-b" declared by package "package-a"']
        })
    );
});

test('resolveAndLinkAll() prefers per-package mainPackageJson over common when running checks', async () => {
    const { packtory } = createPacktoryUnderTest({
        resolveAndLink: fake(async (options: { name: string }) => {
            return linkedBundle({
                name: options.name,
                contents: [
                    {
                        ...bundleResource(`/${options.name}/index.js`, { targetFilePath: 'index.js' }),
                        isSubstituted: false
                    }
                ],
                entryPoints: [
                    {
                        js: {
                            sourceFilePath: `/${options.name}/index.js`,
                            targetFilePath: 'index.js',
                            content: '',
                            isExecutable: false
                        }
                    }
                ],
                externalDependencies: new Map([['runtime-dep', { name: 'runtime-dep', referencedFrom: ['/x'] }]])
            });
        })
    });

    const result = await packtory.resolveAndLinkAll({
        commonPackageSettings: {
            sourcesFolder: '/src',
            mainPackageJson: { type: 'module', devDependencies: { 'runtime-dep': '1.0.0' } },
            publishSettings: { access: 'public' }
        },
        checks: { noDevDependencyImports: { enabled: true } },
        packages: [
            {
                name: 'package-a',
                mainPackageJson: { type: 'module', dependencies: { 'runtime-dep': '1.0.0' } },
                entryPoints: [{ js: 'package-a/index.js' }]
            }
        ]
    });

    assert.strictEqual(result.isOk, true);
});

test('resolveAndLinkAll() runs checks when commonPackageSettings is omitted', async () => {
    const { packtory } = createPacktoryThatSharesSourceFile();

    const result = await packtory.resolveAndLinkAll({
        checks: { noDuplicatedFiles: { enabled: true } },
        packages: [
            {
                name: 'package-a',
                sourcesFolder: '/src',
                mainPackageJson: { type: 'module' },
                publishSettings: { access: 'public' },
                entryPoints: [{ js: 'package-a/index.js' }]
            },
            {
                name: 'package-b',
                sourcesFolder: '/src',
                mainPackageJson: { type: 'module' },
                publishSettings: { access: 'public' },
                entryPoints: [{ js: 'package-b/index.js' }]
            }
        ]
    });

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
            return Result.err(partialResolveFailure('package-a'));
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

test('buildAndPublishAll() passes selectNext and createProgressEvent that expose the published bundle and status', async () => {
    const observed: {
        readonly selected: unknown[];
        readonly progressEvents: unknown[];
    } = {
        selected: [],
        progressEvents: []
    };
    const { packtory } = createPacktoryUnderTest({
        publishStage: async (params) => {
            const options = params.createOptions({
                packageName: 'package-a',
                existing: [],
                config: params.config
            });
            const result = await params.execute(options);
            observed.selected.push(params.selectNext({ result, options }));
            observed.progressEvents.push(
                params.createProgressEvent?.({ packageName: 'package-a', result, options }) ?? null
            );

            return Result.ok([result]);
        }
    });

    const result = await packtory.buildAndPublishAll(createConfig(), { dryRun: false });

    assert.deepStrictEqual(result, Result.ok([{ bundle: createVersionedBundle('package-a'), status: 'new-version' }]));
    assert.deepStrictEqual(observed.selected, [createVersionedBundle('package-a')]);
    assert.deepStrictEqual(observed.progressEvents, [{ version: '1.0.0', status: 'new-version' }]);
});

test('resolveAndLinkAll() honours commonPackageSettings.deadCodeElimination.enabled when running the eliminator', async () => {
    const eliminate = fake(async (inputs: readonly { transformationsEnabled: boolean }[]) => {
        return inputs.map(() => {
            const stub: AnalyzedBundle = {
                ...createLinkedBundle('package-a'),
                contents: [],
                sideEffectsField: undefined
            };
            return stub;
        });
    });
    const eliminator = { eliminate };
    const { packtory } = createPacktoryUnderTest({ deadCodeEliminator: eliminator });
    await packtory.resolveAndLinkAll(
        createConfigWithoutRegistry({
            commonPackageSettings: {
                sourcesFolder: '/src',
                mainPackageJson: { type: 'module' },
                publishSettings: { access: 'public' },
                deadCodeElimination: { enabled: false }
            }
        })
    );
    const eliminationInputs = eliminate.firstCall.args[0] as readonly { transformationsEnabled: boolean }[];
    assert.strictEqual(eliminationInputs[0]?.transformationsEnabled, false);
});

test('resolveAndLinkAll() honours per-package deadCodeElimination.enabled when running the eliminator', async () => {
    const eliminate = fake(async (inputs: readonly { transformationsEnabled: boolean }[]) => {
        return inputs.map(() => {
            const stub: AnalyzedBundle = {
                ...createLinkedBundle('package-a'),
                contents: [],
                sideEffectsField: undefined
            };
            return stub;
        });
    });
    const eliminator = { eliminate };
    const { packtory } = createPacktoryUnderTest({ deadCodeEliminator: eliminator });
    await packtory.resolveAndLinkAll(
        createConfigWithoutRegistry({
            packages: [
                {
                    name: 'package-a',
                    entryPoints: [{ js: 'package-a/index.js' }],
                    deadCodeElimination: { enabled: false }
                }
            ]
        })
    );
    const eliminationInputs = eliminate.firstCall.args[0] as readonly { transformationsEnabled: boolean }[];
    assert.strictEqual(eliminationInputs[0]?.transformationsEnabled, false);
});

test('resolveAndLinkAll() throws when a resolved package has no entry in the transformations map', async () => {
    const { packtory } = createPacktoryUnderTest({
        resolveStage: async () => {
            return Result.ok([
                {
                    name: 'unexpected-package',
                    linkedBundle: createLinkedBundle('unexpected-package'),
                    resolveOptions: {}
                }
            ]);
        }
    });

    try {
        await packtory.resolveAndLinkAll(createConfigWithoutRegistry());
        assert.fail('Expected resolveAndLinkAll to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Missing transformations flag for package "unexpected-package"');
    }
});

test('resolveAndLinkAll() throws when the dead code eliminator returns fewer bundles than packages', async () => {
    const eliminator = {
        eliminate: async () => {
            return [];
        }
    };
    const { packtory } = createPacktoryUnderTest({ deadCodeEliminator: eliminator });

    try {
        await packtory.resolveAndLinkAll(createConfigWithoutRegistry());
        assert.fail('Expected resolveAndLinkAll to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Analyzed bundle missing for package "package-a"');
    }
});

test('resolveAndLinkAll() reports partial scheduler errors with the failure list and an empty succeeded list', async () => {
    const { packtory } = createPacktoryUnderTest({
        resolveStage: async () => {
            return Result.err(partialResolveFailure('package-a'));
        }
    });

    const result = await packtory.resolveAndLinkAll(createConfigWithoutRegistry());

    assert.deepStrictEqual(
        result,
        Result.err({
            type: 'partial',
            error: {
                succeeded: [],
                failures: [new Error('resolve failed')]
            }
        })
    );
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

test('buildAndPublishAll() returns a partial failure when an analyzed bundle is missing for a later package', async () => {
    const linkedPackage = {
        name: 'package-a',
        linkedBundle: createLinkedBundle('package-a'),
        resolveOptions: {
            name: 'package-a',
            sourcesFolder: '/src',
            entryPoints: [{ js: '/src/package-a/index.js' }] as const,
            includeSourceMapFiles: false,
            additionalFiles: [],
            mainPackageJson: { type: 'module' as const },
            additionalPackageJsonAttributes: {},
            allowMutableSpecifiers: [],
            bundleDependencies: [],
            bundlePeerDependencies: []
        }
    };

    const { packtory } = createPacktoryUnderTest({
        resolveStage: async () => {
            return Result.ok([linkedPackage]);
        },
        publishStage: runPublishStageUntilFailure
    });

    const result = await packtory.buildAndPublishAll(createConfig({ packages: twoPackageEntries }), { dryRun: false });

    assert.deepStrictEqual(
        result,
        Result.err({
            type: 'partial',
            succeeded: [{ bundle: createVersionedBundle('package-a'), status: 'new-version' }],
            failures: [new Error('Analyzed bundle for package "package-b" is missing')]
        })
    );
});
