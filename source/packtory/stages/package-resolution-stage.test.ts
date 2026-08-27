import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PackageConfig, PacktoryConfigWithoutRegistry } from '../../config/config.ts';
import { buildPackageGraph } from '../../config/package-graph-builder.ts';
import type { ValidConfigWithoutRegistryResult } from '../../config/validation.ts';
import type { LinkedBundle } from '../../linker/linked-bundle.ts';
import { createProgressBroadcaster } from '../../progress/progress-broadcaster.ts';
import {
    createIteratingScheduler as iteratingScheduler,
    type IteratingSchedulerCapture
} from '../../test-libraries/iterating-scheduler.ts';
import {
    emptyScheduler,
    failingDependencies,
    stubPackageProcessor,
    stubProgressBroadcaster
} from '../../test-libraries/orchestrator-stub-fixtures.ts';
import { resolvePackages } from './package-resolution-stage.ts';

type InputsResolvedPayload = {
    readonly packageName: string;
    readonly roots: Readonly<Record<string, string>>;
    readonly sourceFileCount: number;
    readonly siblingVersions: Readonly<Record<string, string>>;
};

type ResolutionInput = {
    readonly name: string;
};

function packageConfig(name: string): PackageConfig {
    return {
        name,
        roots: { main: { js: `${name}/index.js` } },
        sourcesFolder: '/src',
        mainPackageJson: { type: 'module' },
        publishSettings: { access: 'public' }
    };
}

function configWithoutRegistry(packages: readonly PackageConfig[]): ValidConfigWithoutRegistryResult {
    const packageConfigs: Readonly<Record<string, PackageConfig>> = Object.fromEntries(
        packages.map(function (entry) {
            return [ entry.name, entry ];
        })
    );
    const packtoryConfig: PacktoryConfigWithoutRegistry = {
        commonPackageSettings: {
            sourcesFolder: '/src',
            mainPackageJson: { type: 'module' },
            publishSettings: { access: 'public' }
        },
        packages
    };

    return { packageConfigs, packtoryConfig, packageGraph: buildPackageGraph(packageConfigs) };
}

function emptyConfig(): ValidConfigWithoutRegistryResult {
    return configWithoutRegistry([]);
}

function configWithPackage(name: string): ValidConfigWithoutRegistryResult {
    return configWithoutRegistry([ packageConfig(name) ]);
}

function linkedBundle(
    name: string,
    substitutedSourceFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>
): LinkedBundle {
    return {
        name,
        contents: [],
        roots: {
            main: {
                js: { content: '', isExecutable: false, sourceFilePath: '/src/index.js', targetFilePath: 'index.js' }
            }
        },
        surface: { mode: 'implicit', defaultModuleRoot: 'main' },
        linkedBundleDependencies: new Map(),
        substitutedSourceFilePathsByPackageName,
        sourceMapTransformsByTargetPath: new Map(),
        externalDependencies: new Map()
    };
}

suite('package-resolution-stage', function () {
    test('resolvePackages returns Ok with the scheduler result when nothing is scheduled', async function () {
        const result = await resolvePackages(
            {
                packageProcessor: stubPackageProcessor,
                scheduler: emptyScheduler,
                progressBroadcaster: stubProgressBroadcaster
            },
            emptyConfig()
        );

        assert.strictEqual(result.isOk, true);
    });

    test('resolvePackages forwards scheduler failures unchanged to its caller', async function () {
        const result = await resolvePackages(failingDependencies('boom'), {
            ...emptyConfig()
        });

        assert.strictEqual(result.isErr, true);
    });

    test('resolvePackages emits inputsResolved with package name, roots, zero source files, and empty sibling versions when subscribed', async function () {
        const broadcaster = createProgressBroadcaster();
        const received: InputsResolvedPayload[] = [];
        broadcaster.consumer.on('inputsResolved', function (payload) {
            received.push({
                packageName: payload.packageName,
                roots: payload.roots,
                sourceFileCount: payload.sourceFileCount,
                siblingVersions: payload.siblingVersions
            });
        });

        await resolvePackages(
            {
                packageProcessor: stubPackageProcessor,
                scheduler: iteratingScheduler([ 'pkg-a' ]),
                progressBroadcaster: broadcaster
            },
            configWithPackage('pkg-a')
        );

        assert.deepStrictEqual(received, [
            { packageName: 'pkg-a', roots: { main: '/src/pkg-a/index.js' }, sourceFileCount: 0, siblingVersions: {} }
        ]);
    });

    test('resolvePackages asks the scheduler to emit scheduled package events', async function () {
        const capture: IteratingSchedulerCapture = { events: [] as unknown[], selected: [] as unknown[] };

        await resolvePackages(
            {
                packageProcessor: stubPackageProcessor,
                scheduler: iteratingScheduler([ 'pkg-a' ], capture),
                progressBroadcaster: stubProgressBroadcaster
            },
            configWithPackage('pkg-a')
        );

        assert.strictEqual(capture.emitScheduledEvents, true);
    });

    test('resolvePackages reruns resolution with runtime paths from substitution records', async function () {
        const capture: IteratingSchedulerCapture = { events: [] as unknown[], selected: [] as unknown[] };
        const promotionCalls: {
            readonly packageName: string;
            readonly sourceFilePaths: ReadonlySet<string>;
        }[] = [];
        let resolveAndLinkCallCount = 0;
        async function resolveAndLink(options: ResolutionInput): Promise<LinkedBundle> {
            resolveAndLinkCallCount += 1;
            const substitutions = options.name === 'pkg-b'
                ? new Map([ [ 'pkg-a', new Set([ '/src/pkg-a/internal.js', '/src/pkg-a/internal.d.ts' ]) ] ])
                : new Map();
            return linkedBundle(options.name, substitutions);
        }

        await resolvePackages(
            {
                packageProcessor: {
                    ...stubPackageProcessor,
                    resolveAndLink,
                    async resolveAndLinkWithPromotedDeclarationCompanions(options, sourceFilePaths) {
                        promotionCalls.push({ packageName: options.name, sourceFilePaths });
                        return linkedBundle(options.name, new Map());
                    }
                },
                scheduler: iteratingScheduler([ 'pkg-a', 'pkg-b' ], capture),
                progressBroadcaster: stubProgressBroadcaster
            },
            configWithoutRegistry([ packageConfig('pkg-a'), packageConfig('pkg-b') ])
        );

        assert.strictEqual(resolveAndLinkCallCount, 3);
        assert.deepStrictEqual(promotionCalls, [
            { packageName: 'pkg-a', sourceFilePaths: new Set([ '/src/pkg-a/internal.js' ]) }
        ]);
        assert.strictEqual(capture.emitScheduledEvents, false);
    });

    test('resolvePackages does not rerun resolution for empty substitution records', async function () {
        let resolveAndLinkCallCount = 0;
        async function resolveAndLink(options: ResolutionInput): Promise<LinkedBundle> {
            resolveAndLinkCallCount += 1;
            const substitutions = new Map([ [ 'pkg-a', new Set<string>() ] ]);
            return linkedBundle(options.name, substitutions);
        }

        await resolvePackages(
            {
                packageProcessor: {
                    ...stubPackageProcessor,
                    resolveAndLink
                },
                scheduler: iteratingScheduler([ 'pkg-a' ]),
                progressBroadcaster: stubProgressBroadcaster
            },
            configWithPackage('pkg-a')
        );

        assert.strictEqual(resolveAndLinkCallCount, 1);
    });

    test('resolvePackages emits resolveAndLink package failures to subscribers', async function () {
        const broadcaster = createProgressBroadcaster();
        const failures: unknown[] = [];
        broadcaster.consumer.on('packageFailed', function (payload) {
            failures.push(payload);
        });

        await resolvePackages(
            {
                packageProcessor: {
                    ...stubPackageProcessor,
                    async resolveAndLink() {
                        throw new Error('resolve failed');
                    }
                },
                scheduler: iteratingScheduler([ 'pkg-a' ]),
                progressBroadcaster: broadcaster
            },
            configWithPackage('pkg-a')
        );

        assert.deepStrictEqual(failures, [
            { packageName: 'pkg-a', stage: 'resolveAndLink', message: 'resolve failed' }
        ]);
    });

    test('resolvePackages does NOT emit inputsResolved when no subscriber is registered', async function () {
        const realBroadcaster = createProgressBroadcaster();
        let emitCount = 0;
        const trackingBroadcaster = {
            consumer: realBroadcaster.consumer,
            provider: {
                emit(eventName: string, payload: unknown) {
                    if (eventName === 'inputsResolved') {
                        emitCount += 1;
                    }
                    realBroadcaster.provider.emit(eventName as never, payload as never);
                },
                hasSubscribers(eventName: string) {
                    return realBroadcaster.provider.hasSubscribers(eventName as never);
                }
            }
        };

        await resolvePackages(
            {
                packageProcessor: stubPackageProcessor,
                scheduler: iteratingScheduler([ 'pkg-a' ]),
                progressBroadcaster: trackingBroadcaster
            },
            configWithPackage('pkg-a')
        );

        assert.strictEqual(emitCount, 0);
    });
});
