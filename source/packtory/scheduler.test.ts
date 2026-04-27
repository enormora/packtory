import assert from 'node:assert';
import { test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Result } from 'true-myth';
import { validateConfigWithoutRegistry, type ValidConfigWithoutRegistryResult } from '../config/validation.ts';
import { createScheduler, type Scheduler as SchedulerType } from './scheduler.ts';

type EmitCallArguments = readonly [string, unknown];
type PackageNameResult = { readonly packageName: string };

function createValidatedConfig(packages: readonly Record<string, unknown>[]): ValidConfigWithoutRegistryResult {
    const result = validateConfigWithoutRegistry({
        commonPackageSettings: { sourcesFolder: '/src', mainPackageJson: {} },
        packages
    });

    if (result.isErr) {
        throw new Error(result.error.join('\n'));
    }

    return result.value;
}

function createTestScheduler(emit: SinonSpy = fake()): {
    readonly scheduler: SchedulerType;
    readonly emit: SinonSpy;
} {
    return {
        scheduler: createScheduler({
            progressBroadcastProvider: {
                emit: (eventName, payload) => {
                    emit(eventName, payload);
                }
            }
        }),
        emit
    };
}

function getEmitCallArguments(emit: SinonSpy): readonly EmitCallArguments[] {
    return emit.getCalls().map((call) => {
        return call.args as EmitCallArguments;
    });
}

function getErrResult<TValue, TError>(result: Result<TValue, TError>, message: string): TError {
    if (result.isErr) {
        return result.error;
    }

    assert.fail(message);
    throw new Error(message);
}

function createPackageExecutionSnapshots(config: ValidConfigWithoutRegistryResult): {
    readonly snapshots: readonly { packageName: string; existing: readonly string[] }[];
    readonly configs: readonly unknown[];
    readonly createOptions: SinonSpy;
    readonly execute: SinonSpy;
} {
    const snapshots: { packageName: string; existing: readonly string[] }[] = [];
    const configs: unknown[] = [];
    const createOptions = fake((context: { packageName: string; existing: readonly string[] }) => {
        snapshots.push({
            packageName: context.packageName,
            existing: Array.from(context.existing)
        });
        configs.push(config);
        return { packageName: context.packageName, existing: Array.from(context.existing) };
    });
    const execute = fake(async (context: { packageName: string }) => {
        return `${context.packageName}-result`;
    });

    return { snapshots, configs, createOptions, execute };
}

test('runForEachScheduledPackage() emits scheduled events per default and passes previous generation results into createOptions()', async () => {
    const { scheduler, emit } = createTestScheduler();
    const config = createValidatedConfig([
        { name: 'dependency', entryPoints: [{ js: 'dependency.js' }] },
        { name: 'package-a', entryPoints: [{ js: 'entry.js' }], bundleDependencies: ['dependency'] }
    ]);
    const { snapshots, configs, createOptions, execute } = createPackageExecutionSnapshots(config);

    const result = await scheduler.runForEachScheduledPackage({
        config,
        createOptions,
        execute,
        selectNext: (params: { result: string }) => {
            return params.result;
        }
    });

    assert.deepStrictEqual(result, Result.ok(['dependency-result', 'package-a-result']));
    assert.deepStrictEqual(snapshots, [
        { packageName: 'dependency', existing: [] },
        { packageName: 'package-a', existing: ['dependency-result'] }
    ]);
    assert.deepStrictEqual(configs, [config, config]);
    assert.deepStrictEqual(getEmitCallArguments(emit), [
        ['scheduled', { packageName: 'dependency' }],
        ['scheduled', { packageName: 'package-a' }]
    ]);
});

test('runForEachScheduledPackage() can disable scheduled events and emits done events from createProgressEvent()', async () => {
    const { scheduler, emit } = createTestScheduler();

    const result = await scheduler.runForEachScheduledPackage({
        config: createValidatedConfig([{ name: 'package-a', entryPoints: [{ js: 'entry.js' }] }]),
        createOptions: (context) => {
            return context.packageName;
        },
        execute: async (packageName) => {
            return { packageName };
        },
        selectNext: (params) => {
            return params.result.packageName;
        },
        emitScheduledEvents: false,
        createProgressEvent: (params) => {
            return {
                version: '1.0.0',
                status: params.result.packageName === 'package-a' ? 'initial-version' : 'new-version'
            };
        }
    });

    assert.deepStrictEqual(result, Result.ok([{ packageName: 'package-a' }]));
    assert.deepStrictEqual(getEmitCallArguments(emit), [
        ['done', { packageName: 'package-a', version: '1.0.0', status: 'initial-version' }]
    ]);
});

test('runForEachScheduledPackage() returns succeeded results from previous and current generations when a package fails', async () => {
    const { scheduler, emit } = createTestScheduler();
    const execute = fake(async (context: { packageName: string }) => {
        if (context.packageName === 'package-b') {
            throw new Error('package-b failed');
        }

        return `${context.packageName}-result`;
    });

    const result = await scheduler.runForEachScheduledPackage({
        config: createValidatedConfig([
            { name: 'root', entryPoints: [{ js: 'root.js' }] },
            { name: 'package-a', entryPoints: [{ js: 'package-a.js' }], bundleDependencies: ['root'] },
            { name: 'package-b', entryPoints: [{ js: 'package-b.js' }], bundleDependencies: ['root'] }
        ]),
        createOptions: (context) => {
            return { packageName: context.packageName };
        },
        execute,
        selectNext: (params) => {
            return params.result;
        },
        createProgressEvent: (params) => {
            return {
                version: params.result,
                status: 'new-version'
            };
        }
    });

    const error = getErrResult(result, 'Expected result to be an error');
    assert.deepStrictEqual(error.succeeded, ['root-result', 'package-a-result']);
    assert.strictEqual(error.failures.length, 1);
    assert.strictEqual(error.failures[0]?.message, 'package-b failed');
    assert.deepStrictEqual(getEmitCallArguments(emit), [
        ['scheduled', { packageName: 'root' }],
        ['scheduled', { packageName: 'package-a' }],
        ['scheduled', { packageName: 'package-b' }],
        ['done', { packageName: 'root', version: 'root-result', status: 'new-version' }],
        ['done', { packageName: 'package-a', version: 'package-a-result', status: 'new-version' }],
        ['error', { packageName: 'package-b', error: new Error('package-b failed') }]
    ]);
});

test('runForEachScheduledPackage() converts non-Error throws into an unknown error event', async () => {
    const { scheduler, emit } = createTestScheduler();

    const result = await scheduler.runForEachScheduledPackage({
        config: createValidatedConfig([{ name: 'package-a', entryPoints: [{ js: 'entry.js' }] }]),
        createOptions: (context) => {
            return context.packageName;
        },
        execute: async () => {
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors, unicorn/no-useless-promise-resolve-reject -- we intentionally exercise non-Error rejection handling here
            return Promise.reject('not-an-error');
        },
        selectNext: (params: { result: PackageNameResult }) => {
            return params.result;
        }
    });

    getErrResult(result, 'Expected result to be an error');
    assert.deepStrictEqual(getEmitCallArguments(emit), [
        ['scheduled', { packageName: 'package-a' }],
        ['error', { packageName: 'package-a', error: new Error('Unknown error') }]
    ]);
});
