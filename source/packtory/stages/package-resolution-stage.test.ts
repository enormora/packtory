import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PackageConfiguration, PacktoryConfigurationWithoutRegistry } from '../../configuration/configuration.ts';
import { buildPackageGraph } from '../../configuration/package-graph-builder.ts';
import type { ValidConfigurationWithoutRegistryResult } from '../../configuration/validation.ts';
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

function packageConfiguration(name: string): PackageConfiguration {
    return {
        name,
        roots: { main: { javaScript: `${name}/index.js` } },
        sourcesFolder: '/source',
        mainPackageManifest: { type: 'module' },
        publishSettings: { access: 'public' }
    };
}

function configurationWithoutRegistry(
    packages: readonly PackageConfiguration[]
): ValidConfigurationWithoutRegistryResult {
    const packageConfigurations: Readonly<Record<string, PackageConfiguration>> = Object.fromEntries(
        packages.map(function (entry) {
            return [ entry.name, entry ];
        })
    );
    const packtoryConfiguration: PacktoryConfigurationWithoutRegistry = {
        commonPackageSettings: {
            sourcesFolder: '/source',
            mainPackageManifest: { type: 'module' },
            publishSettings: { access: 'public' }
        },
        packages
    };

    return { packageConfigurations, packtoryConfiguration, packageGraph: buildPackageGraph(packageConfigurations) };
}

function emptyConfiguration(): ValidConfigurationWithoutRegistryResult {
    return configurationWithoutRegistry([]);
}

function configurationWithPackage(name: string): ValidConfigurationWithoutRegistryResult {
    return configurationWithoutRegistry([ packageConfiguration(name) ]);
}

function linkedBundle(
    name: string,
    substitutedInputFilePathsByPackageName: ReadonlyMap<string, ReadonlySet<string>>
): LinkedBundle {
    return {
        name,
        contents: [],
        roots: {
            main: {
                javaScript: {
                    content: '',
                    isExecutable: false,
                    inputFilePath: '/source/index.js',
                    targetFilePath: 'index.js'
                }
            }
        },
        surface: { mode: 'implicit', defaultModuleRoot: 'main' },
        linkedBundleDependencies: new Map(),
        substitutedInputFilePathsByPackageName,
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
            emptyConfiguration()
        );

        assert.strictEqual(result.isOk, true);
    });

    test('resolvePackages forwards scheduler failures unchanged to its caller', async function () {
        const result = await resolvePackages(failingDependencies('boom'), {
            ...emptyConfiguration()
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
                scheduler: iteratingScheduler([ 'package-a' ]),
                progressBroadcaster: broadcaster
            },
            configurationWithPackage('package-a')
        );

        assert.deepStrictEqual(received, [
            {
                packageName: 'package-a',
                roots: { main: '/source/package-a/index.js' },
                sourceFileCount: 0,
                siblingVersions: {}
            }
        ]);
    });

    test('resolvePackages asks the scheduler to emit scheduled package events', async function () {
        const capture: IteratingSchedulerCapture = { events: [] as unknown[], selected: [] as unknown[] };

        await resolvePackages(
            {
                packageProcessor: stubPackageProcessor,
                scheduler: iteratingScheduler([ 'package-a' ], capture),
                progressBroadcaster: stubProgressBroadcaster
            },
            configurationWithPackage('package-a')
        );

        assert.strictEqual(capture.emitScheduledEvents, true);
    });

    test('resolvePackages reruns resolution with runtime paths from substitution records', async function () {
        const capture: IteratingSchedulerCapture = { events: [] as unknown[], selected: [] as unknown[] };
        const promotionCalls: {
            readonly packageName: string;
            readonly inputFilePaths: ReadonlySet<string>;
        }[] = [];
        let resolveAndLinkCallCount = 0;
        async function resolveAndLink(options: ResolutionInput): Promise<LinkedBundle> {
            resolveAndLinkCallCount += 1;
            const substitutions = options.name === 'package-b'
                ? new Map([ [
                    'package-a',
                    new Set([ '/source/package-a/internal.js', '/source/package-a/internal.d.ts' ])
                ] ])
                : new Map();
            return linkedBundle(options.name, substitutions);
        }

        await resolvePackages(
            {
                packageProcessor: {
                    ...stubPackageProcessor,
                    resolveAndLink,
                    async resolveAndLinkWithPromotedDeclarationCompanions(options, inputFilePaths) {
                        promotionCalls.push({ packageName: options.name, inputFilePaths });
                        return linkedBundle(options.name, new Map());
                    }
                },
                scheduler: iteratingScheduler([ 'package-a', 'package-b' ], capture),
                progressBroadcaster: stubProgressBroadcaster
            },
            configurationWithoutRegistry([ packageConfiguration('package-a'), packageConfiguration('package-b') ])
        );

        assert.strictEqual(resolveAndLinkCallCount, 3);
        assert.deepStrictEqual(promotionCalls, [
            { packageName: 'package-a', inputFilePaths: new Set([ '/source/package-a/internal.js' ]) }
        ]);
        assert.strictEqual(capture.emitScheduledEvents, false);
    });

    test('resolvePackages does not rerun resolution for empty substitution records', async function () {
        let resolveAndLinkCallCount = 0;
        async function resolveAndLink(options: ResolutionInput): Promise<LinkedBundle> {
            resolveAndLinkCallCount += 1;
            const substitutions = new Map([ [ 'package-a', new Set<string>() ] ]);
            return linkedBundle(options.name, substitutions);
        }

        await resolvePackages(
            {
                packageProcessor: {
                    ...stubPackageProcessor,
                    resolveAndLink
                },
                scheduler: iteratingScheduler([ 'package-a' ]),
                progressBroadcaster: stubProgressBroadcaster
            },
            configurationWithPackage('package-a')
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
                scheduler: iteratingScheduler([ 'package-a' ]),
                progressBroadcaster: broadcaster
            },
            configurationWithPackage('package-a')
        );

        assert.deepStrictEqual(failures, [
            { packageName: 'package-a', stage: 'resolveAndLink', message: 'resolve failed' }
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
                scheduler: iteratingScheduler([ 'package-a' ]),
                progressBroadcaster: trackingBroadcaster
            },
            configurationWithPackage('package-a')
        );

        assert.strictEqual(emitCount, 0);
    });
});
