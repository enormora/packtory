import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PackageConfig, PacktoryConfigWithoutRegistry } from '../../config/config.ts';
import { buildPackageGraph } from '../../config/package-graph-builder.ts';
import type { ValidConfigWithoutRegistryResult } from '../../config/validation.ts';
import { createProgressBroadcaster } from '../../progress/progress-broadcaster.ts';
import { createIteratingScheduler as iteratingScheduler } from '../../test-libraries/iterating-scheduler.ts';
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
