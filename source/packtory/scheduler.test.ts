/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-shadow, @typescript-eslint/strict-void-return, max-statements, destructuring/in-params, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unnecessary-condition, no-throw-literal, @typescript-eslint/only-throw-error -- scheduler tests deliberately use compact fixtures and literal failures to exercise edge handling */
import assert from 'node:assert';
import { test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Result } from 'true-myth';
import { validateConfigWithoutRegistry } from '../config/validation.ts';
import { createScheduler, type Scheduler } from './scheduler.ts';

function createValidatedConfig(packages: readonly Record<string, unknown>[]) {
    const result = validateConfigWithoutRegistry({
        commonPackageSettings: { sourcesFolder: '/src', mainPackageJson: {} },
        packages
    });

    if (result.isErr) {
        throw new Error(result.error.join('\n'));
    }

    return result.value;
}

function createTestScheduler(emit: SinonSpy = fake()): { readonly scheduler: Scheduler; readonly emit: SinonSpy } {
    return {
        scheduler: createScheduler({ progressBroadcastProvider: { emit } }),
        emit
    };
}

test('runForEachScheduledPackage() emits scheduled events per default and passes previous generation results into createOptions()', async () => {
    const { scheduler, emit } = createTestScheduler();
    const config = createValidatedConfig([
        { name: 'dependency', entryPoints: [{ js: 'dependency.js' }] },
        { name: 'package-a', entryPoints: [{ js: 'entry.js' }], bundleDependencies: ['dependency'] }
    ]);
    const createOptionSnapshots: { packageName: string; existing: readonly string[] }[] = [];
    const configSnapshots: unknown[] = [];
    const createOptions = fake(({ packageName, existing }: { packageName: string; existing: readonly string[] }) => {
        createOptionSnapshots.push({
            packageName,
            existing: Array.from(existing)
        });
        configSnapshots.push(config);
        return { packageName, existing: Array.from(existing) };
    });
    const execute = fake(async ({ packageName }: { packageName: string }) => {
        return `${packageName}-result`;
    });

    const result = await scheduler.runForEachScheduledPackage({
        config,
        createOptions,
        execute,
        selectNext: ({ result }: { result: string }) => {
            return result;
        }
    });

    assert.deepStrictEqual(result, Result.ok(['dependency-result', 'package-a-result']));
    assert.deepStrictEqual(createOptionSnapshots, [
        { packageName: 'dependency', existing: [] },
        { packageName: 'package-a', existing: ['dependency-result'] }
    ]);
    assert.deepStrictEqual(configSnapshots, [config, config]);
    assert.deepStrictEqual(
        emit.getCalls().map((call) => {
            return call.args;
        }),
        [
            ['scheduled', { packageName: 'dependency' }],
            ['scheduled', { packageName: 'package-a' }]
        ]
    );
});

test('runForEachScheduledPackage() can disable scheduled events and emits done events from createProgressEvent()', async () => {
    const { scheduler, emit } = createTestScheduler();

    const result = await scheduler.runForEachScheduledPackage({
        config: createValidatedConfig([{ name: 'package-a', entryPoints: [{ js: 'entry.js' }] }]),
        createOptions: ({ packageName }) => {
            return packageName;
        },
        execute: async (packageName) => {
            return { packageName };
        },
        selectNext: ({ result }) => {
            return result.packageName;
        },
        emitScheduledEvents: false,
        createProgressEvent: ({ result }) => {
            return {
                version: '1.0.0',
                status: result.packageName === 'package-a' ? 'initial-version' : 'new-version'
            };
        }
    });

    assert.deepStrictEqual(result, Result.ok([{ packageName: 'package-a' }]));
    assert.deepStrictEqual(
        emit.getCalls().map((call) => {
            return call.args;
        }),
        [['done', { packageName: 'package-a', version: '1.0.0', status: 'initial-version' }]]
    );
});

test('runForEachScheduledPackage() returns succeeded results from previous and current generations when a package fails', async () => {
    const { scheduler, emit } = createTestScheduler();
    const execute = fake(async ({ packageName }: { packageName: string }) => {
        if (packageName === 'package-b') {
            throw new Error('package-b failed');
        }

        return `${packageName}-result`;
    });

    const result = await scheduler.runForEachScheduledPackage({
        config: createValidatedConfig([
            { name: 'root', entryPoints: [{ js: 'root.js' }] },
            { name: 'package-a', entryPoints: [{ js: 'package-a.js' }], bundleDependencies: ['root'] },
            { name: 'package-b', entryPoints: [{ js: 'package-b.js' }], bundleDependencies: ['root'] }
        ]),
        createOptions: ({ packageName }) => {
            return { packageName };
        },
        execute,
        selectNext: ({ result }) => {
            return result;
        },
        createProgressEvent: ({ result }) => {
            return {
                version: result,
                status: 'new-version'
            };
        }
    });

    assert.strictEqual(result.isErr, true);
    if (result.isOk) {
        assert.fail('Expected result to be an error');
    }
    assert.deepStrictEqual(result.error.succeeded, ['root-result', 'package-a-result']);
    assert.strictEqual(result.error.failures.length, 1);
    assert.strictEqual(result.error.failures[0]?.message, 'package-b failed');
    assert.deepStrictEqual(
        emit.getCalls().map((call) => {
            return call.args;
        }),
        [
            ['scheduled', { packageName: 'root' }],
            ['scheduled', { packageName: 'package-a' }],
            ['scheduled', { packageName: 'package-b' }],
            ['done', { packageName: 'root', version: 'root-result', status: 'new-version' }],
            ['done', { packageName: 'package-a', version: 'package-a-result', status: 'new-version' }],
            ['error', { packageName: 'package-b', error: new Error('package-b failed') }]
        ]
    );
});

test('runForEachScheduledPackage() converts non-Error throws into an unknown error event', async () => {
    const { scheduler, emit } = createTestScheduler();

    const result = await scheduler.runForEachScheduledPackage({
        config: createValidatedConfig([{ name: 'package-a', entryPoints: [{ js: 'entry.js' }] }]),
        createOptions: ({ packageName }) => {
            return packageName;
        },
        execute: async () => {
            throw 'not-an-error';
        },
        selectNext: ({ result }) => {
            return result;
        }
    });

    assert.strictEqual(result.isErr, true);
    assert.deepStrictEqual(
        emit.getCalls().map((call) => {
            return call.args;
        }),
        [
            ['scheduled', { packageName: 'package-a' }],
            ['error', { packageName: 'package-a', error: new Error('Unknown error') }]
        ]
    );
});
