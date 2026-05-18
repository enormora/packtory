import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Result } from 'true-myth';
import { createProgressBroadcaster } from '../../progress/progress-broadcaster.ts';
import type { ProgressBroadcaster } from '../packtory-results.ts';
import type { Scheduler as PackageScheduler } from '../scheduler.ts';
import {
    emptyScheduler,
    failingScheduler,
    stubPackageProcessor,
    stubProgressBroadcaster
} from '../../test-libraries/orchestrator-stub-fixtures.ts';
import { resolvePackages } from './package-resolution-stage.ts';

function iteratingScheduler(packageNames: readonly string[]): PackageScheduler {
    const value = {
        async runForEachScheduledPackage(params: {
            readonly config: { readonly packtoryConfig: { readonly packages: readonly { readonly name: string }[] } };
            readonly createOptions: (context: unknown) => unknown;
            readonly execute: (options: unknown) => Promise<unknown>;
            readonly selectNext: (params: { readonly result: unknown; readonly options: unknown }) => unknown;
        }) {
            const results: unknown[] = [];
            const existing: unknown[] = [];
            for (const packageName of packageNames) {
                const options = params.createOptions({ packageName, existing, config: params.config });
                const result = await params.execute(options);
                results.push(result);
                existing.push(params.selectNext({ result, options }));
            }
            return Result.ok(results);
        }
    };
    return value as unknown as PackageScheduler;
}

function configWithPackage(name: string) {
    return {
        packageConfigs: {
            [name]: {
                name,
                roots: { main: { js: `${name}/index.js` } },
                sourcesFolder: '/src',
                mainPackageJson: { name, version: '1.0.0', type: 'module' },
                publishSettings: { access: 'public' }
            }
        },
        packtoryConfig: {
            commonPackageSettings: {
                sourcesFolder: '/src',
                mainPackageJson: { type: 'module' },
                publishSettings: { access: 'public' }
            },
            packages: [{ name, roots: { main: { js: `${name}/index.js` } } }]
        }
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
            { packageConfigs: {}, packtoryConfig: { packages: [] } } as never
        );

        assert.strictEqual(result.isOk, true);
    });

    test('resolvePackages forwards scheduler failures unchanged to its caller', async function () {
        const result = await resolvePackages(
            {
                packageProcessor: stubPackageProcessor,
                scheduler: failingScheduler({ succeeded: [], failures: [new Error('boom')] }),
                progressBroadcaster: stubProgressBroadcaster
            },
            { packageConfigs: {}, packtoryConfig: { packages: [] } } as never
        );

        assert.strictEqual(result.isErr, true);
    });

    test('resolvePackages emits inputsResolved with package name, roots, zero source files, and empty sibling versions when subscribed', async function () {
        const broadcaster = createProgressBroadcaster();
        const received: {
            readonly packageName: string;
            readonly roots: Readonly<Record<string, string>>;
            readonly sourceFileCount: number;
            readonly siblingVersions: Readonly<Record<string, string>>;
        }[] = [];
        broadcaster.consumer.on('inputsResolved', (payload) => {
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
                scheduler: iteratingScheduler(['pkg-a']),
                progressBroadcaster: broadcaster as unknown as ProgressBroadcaster
            },
            configWithPackage('pkg-a') as never
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
                emit: (eventName: string, payload: unknown) => {
                    if (eventName === 'inputsResolved') {
                        emitCount += 1;
                    }
                    realBroadcaster.provider.emit(eventName as never, payload as never);
                },
                hasSubscribers: (eventName: string) => {
                    return realBroadcaster.provider.hasSubscribers(eventName as never);
                }
            }
        };

        await resolvePackages(
            {
                packageProcessor: stubPackageProcessor,
                scheduler: iteratingScheduler(['pkg-a']),
                progressBroadcaster: trackingBroadcaster as unknown as ProgressBroadcaster
            },
            configWithPackage('pkg-a') as never
        );

        assert.strictEqual(emitCount, 0);
    });
});
