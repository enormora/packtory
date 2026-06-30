import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Result } from 'true-myth';
import { noPublication } from '../bundle-emitter/publication-outcome.ts';
import { validateConfigWithoutRegistry, type ValidConfigWithoutRegistryResult } from '../config/validation.ts';
import { getErrResult } from '../test-libraries/result-helpers.ts';
import { createScheduler, type Scheduler as SchedulerType } from './scheduler.ts';

type EmitCallArguments = readonly [string, unknown];
type PackageNameResult = { readonly packageName: string; };
type SchedulerFixture = {
    readonly scheduler: SchedulerType;
    readonly emit: SinonSpy;
};
type ExecutionSnapshot = {
    readonly existing: readonly string[];
    readonly packageName: string;
};
type CreateOptionsContext = {
    readonly existing: readonly string[];
    readonly packageName: string;
};
type PackageExecutionSnapshots = {
    readonly snapshots: readonly ExecutionSnapshot[];
    readonly configs: readonly unknown[];
    readonly createOptions: SinonSpy;
    readonly execute: SinonSpy;
};
type SelectStringResultParams = {
    readonly result: string;
};
type SelectPackageNameResultParams = {
    readonly result: PackageNameResult;
};

function createValidatedConfig(packages: readonly Record<string, unknown>[]): ValidConfigWithoutRegistryResult {
    const result = validateConfigWithoutRegistry({
        commonPackageSettings: {
            sourcesFolder: '/src',
            mainPackageJson: { type: 'module' },
            publishSettings: { access: 'public' }
        },
        packages
    });

    if (result.isErr) {
        throw new Error(result.error.join('\n'));
    }

    return result.value;
}

function createTestScheduler(emit: SinonSpy = fake()): SchedulerFixture {
    return {
        scheduler: createScheduler({
            progressBroadcastProvider: {
                emit(eventName, payload) {
                    emit(eventName, payload);
                },
                hasSubscribers() {
                    return false;
                }
            }
        }),
        emit
    };
}

function getEmitCallArguments(emit: SinonSpy): readonly EmitCallArguments[] {
    return emit.getCalls().map(function (call) {
        return call.args as unknown as EmitCallArguments;
    });
}

function createPackageExecutionSnapshots(config: ValidConfigWithoutRegistryResult): PackageExecutionSnapshots {
    const snapshots: ExecutionSnapshot[] = [];
    const configs: unknown[] = [];
    const createOptions = fake(
        function (context: CreateOptionsContext) {
            snapshots.push({
                packageName: context.packageName,
                existing: Array.from(context.existing)
            });
            configs.push(config);
            return { packageName: context.packageName, existing: Array.from(context.existing) };
        }
    );
    const execute = fake(async function (context: PackageNameResult) {
        return `${context.packageName}-result`;
    });

    return { snapshots, configs, createOptions, execute };
}

suite('scheduler', function () {
    test('runForEachScheduledPackage() emits scheduled events per default and passes previous generation results into createOptions()', async function () {
        const { scheduler, emit } = createTestScheduler();
        const config = createValidatedConfig([
            { name: 'dependency', roots: { main: { js: 'dependency.js' } } },
            { name: 'package-a', roots: { main: { js: 'entry.js' } }, bundleDependencies: [ 'dependency' ] }
        ]);
        const { snapshots, configs, createOptions, execute } = createPackageExecutionSnapshots(config);

        const result = await scheduler.runForEachScheduledPackage({
            config,
            createOptions,
            execute,
            selectNext(params: SelectStringResultParams) {
                return params.result;
            }
        });

        assert.deepStrictEqual(result, Result.ok([ 'dependency-result', 'package-a-result' ]));
        assert.deepStrictEqual(snapshots, [
            { packageName: 'dependency', existing: [] },
            { packageName: 'package-a', existing: [ 'dependency-result' ] }
        ]);
        assert.deepStrictEqual(configs, [ config, config ]);
        assert.deepStrictEqual(getEmitCallArguments(emit), [
            [ 'scheduled', { packageName: 'dependency' } ],
            [ 'scheduled', { packageName: 'package-a' } ]
        ]);
    });

    test('runForEachScheduledPackage() can disable scheduled events and emits done events from createProgressEvent()', async function () {
        const { scheduler, emit } = createTestScheduler();

        const result = await scheduler.runForEachScheduledPackage({
            config: createValidatedConfig([ { name: 'package-a', roots: { main: { js: 'entry.js' } } } ]),
            createOptions(context) {
                return context.packageName;
            },
            async execute(packageName) {
                return { packageName };
            },
            selectNext(params) {
                return params.result.packageName;
            },
            emitScheduledEvents: false,
            createProgressEvent(params) {
                return {
                    version: '1.0.0',
                    status: params.result.packageName === 'package-a' ? 'initial-version' : 'new-version',
                    publication: noPublication
                };
            }
        });

        assert.deepStrictEqual(result, Result.ok([ { packageName: 'package-a' } ]));
        assert.deepStrictEqual(getEmitCallArguments(emit), [
            [
                'done',
                { packageName: 'package-a', version: '1.0.0', status: 'initial-version', publication: noPublication }
            ]
        ]);
    });

    test('runForEachScheduledPackage() returns succeeded results from previous and current generations when a package fails', async function () {
        const { scheduler, emit } = createTestScheduler();
        const execute = fake(async function (context: PackageNameResult) {
            if (context.packageName === 'package-b') {
                throw new Error('package-b failed');
            }

            return `${context.packageName}-result`;
        });

        const result = await scheduler.runForEachScheduledPackage({
            config: createValidatedConfig([
                { name: 'root', roots: { main: { js: 'root.js' } } },
                { name: 'package-a', roots: { main: { js: 'package-a.js' } }, bundleDependencies: [ 'root' ] },
                { name: 'package-b', roots: { main: { js: 'package-b.js' } }, bundleDependencies: [ 'root' ] }
            ]),
            createOptions(context) {
                return { packageName: context.packageName };
            },
            execute,
            selectNext(params) {
                return params.result;
            },
            createProgressEvent(params) {
                return {
                    version: params.result,
                    status: 'new-version',
                    publication: noPublication
                };
            }
        });

        const error = getErrResult(result, 'Expected result to be an error');
        assert.deepStrictEqual(error.succeeded, [ 'root-result', 'package-a-result' ]);
        assert.strictEqual(error.failures.length, 1);
        assert.strictEqual(error.failures[0]?.message, 'package-b failed');
        const emitCalls = getEmitCallArguments(emit);
        assert.deepStrictEqual(emitCalls.slice(0, 4), [
            [ 'scheduled', { packageName: 'root' } ],
            [ 'scheduled', { packageName: 'package-a' } ],
            [ 'scheduled', { packageName: 'package-b' } ],
            [
                'done',
                { packageName: 'root', version: 'root-result', status: 'new-version', publication: noPublication }
            ]
        ]);
        assert.deepStrictEqual(
            emitCalls.slice(4).toSorted(function ([ leftEvent ], [ rightEvent ]) {
                return leftEvent.localeCompare(rightEvent);
            }),
            [
                [
                    'done',
                    {
                        packageName: 'package-a',
                        version: 'package-a-result',
                        status: 'new-version',
                        publication: noPublication
                    }
                ],
                [ 'error', { packageName: 'package-b', error: new Error('package-b failed') } ]
            ]
        );
    });

    test('runForEachScheduledPackage() converts non-Error throws into an unknown error event', async function () {
        const { scheduler, emit } = createTestScheduler();

        const result = await scheduler.runForEachScheduledPackage({
            config: createValidatedConfig([ { name: 'package-a', roots: { main: { js: 'entry.js' } } } ]),
            createOptions(context) {
                return context.packageName;
            },
            async execute() {
                // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors, unicorn/no-useless-promise-resolve-reject -- we intentionally exercise non-Error rejection handling here
                return Promise.reject('not-an-error');
            },
            selectNext(params: SelectPackageNameResultParams) {
                return params.result;
            }
        });

        getErrResult(result, 'Expected result to be an error');
        assert.deepStrictEqual(getEmitCallArguments(emit), [
            [ 'scheduled', { packageName: 'package-a' } ],
            [ 'error', { packageName: 'package-a', error: new Error('Unknown error') } ]
        ]);
    });
});
