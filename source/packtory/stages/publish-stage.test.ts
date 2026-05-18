/* eslint-disable @typescript-eslint/consistent-type-assertions -- test stubs cast partial mocks of complex orchestrator types */
import assert from 'node:assert';
import { test } from 'mocha';
import { Result } from 'true-myth';
import type { Scheduler as PackageScheduler } from '../scheduler.ts';
import {
    emptyScheduler,
    failingScheduler,
    stubPackageProcessor,
    stubProgressBroadcaster
} from '../../test-libraries/orchestrator-stub-fixtures.ts';
import { determineVersionAndPublishAll } from './publish-stage.ts';

type IterateParams = {
    readonly config: { readonly packtoryConfig: { readonly packages: readonly { readonly name: string }[] } };
    readonly createOptions: (context: unknown) => unknown;
    readonly execute: (options: unknown) => Promise<unknown>;
    readonly selectNext: (params: { readonly result: unknown; readonly options: unknown }) => unknown;
    readonly createProgressEvent?: (params: {
        readonly packageName: string;
        readonly result: unknown;
        readonly options: unknown;
    }) => unknown;
};

function iteratingScheduler(
    packageNames: readonly string[],
    capture?: { events: unknown[]; selected: unknown[] }
): PackageScheduler {
    const value = {
        async runForEachScheduledPackage(params: IterateParams) {
            const results: unknown[] = [];
            const failures: Error[] = [];
            const existing: unknown[] = [];
            for (const packageName of packageNames) {
                const options = params.createOptions({ packageName, existing, config: params.config });
                try {
                    const result = await params.execute(options);
                    results.push(result);
                    const selected = params.selectNext({ result, options });
                    existing.push(selected);
                    capture?.selected.push(selected);
                    const event = params.createProgressEvent?.({ packageName, result, options });
                    if (event !== undefined) {
                        capture?.events.push(event);
                    }
                } catch (error) {
                    failures.push(error as Error);
                }
            }
            if (failures.length > 0) {
                return Result.err({ succeeded: results, failures });
            }
            return Result.ok(results);
        }
    };
    return value as unknown as PackageScheduler;
}

test('determineVersionAndPublishAll returns Ok([]) when no packages are scheduled', async () => {
    const result = await determineVersionAndPublishAll(
        {
            packageProcessor: stubPackageProcessor,
            scheduler: emptyScheduler,
            progressBroadcaster: stubProgressBroadcaster
        },
        { packageConfigs: {}, packtoryConfig: { packages: [] } } as never,
        [],
        { dryRun: false }
    );

    assert.strictEqual(result.isOk, true);
});

test('determineVersionAndPublishAll forwards a scheduler failure unchanged', async () => {
    const result = await determineVersionAndPublishAll(
        {
            packageProcessor: stubPackageProcessor,
            scheduler: failingScheduler({ succeeded: [], failures: [new Error('boom')] }),
            progressBroadcaster: stubProgressBroadcaster
        },
        { packageConfigs: {}, packtoryConfig: { packages: [] } } as never,
        [],
        { dryRun: false }
    );

    assert.strictEqual(result.isErr, true);
});

function publishableConfig(name: string) {
    const packageEntry = {
        name,
        roots: { main: { js: 'index.js' } },
        sourcesFolder: '/src',
        mainPackageJson: { name, version: '1.0.0', type: 'module' },
        publishSettings: { access: 'public' },
        registrySettings: { registryUrl: 'https://example.com', token: 'x' }
    };
    return {
        packageConfigs: { [name]: packageEntry },
        packtoryConfig: { packages: [packageEntry] }
    };
}

test('determineVersionAndPublishAll returns a partial failure when no analyzed bundle is found for a scheduled package', async () => {
    const config = publishableConfig('pkg-orphan');

    const result = await determineVersionAndPublishAll(
        {
            packageProcessor: stubPackageProcessor,
            scheduler: iteratingScheduler(['pkg-orphan']),
            progressBroadcaster: stubProgressBroadcaster
        },
        config as never,
        [],
        { dryRun: false }
    );

    if (!result.isErr) {
        assert.fail('expected the result to be an error');
    }
    assert.strictEqual(result.error.failures.length, 1);
    assert.match((result.error.failures[0] as Error).message, /Analyzed bundle for package "pkg-orphan" is missing/u);
});

test('determineVersionAndPublishAll exposes the published bundle via selectNext and the version+status via createProgressEvent', async () => {
    const bundle = {
        name: 'pkg-a',
        version: '2.0.0',
        packageJson: { name: 'pkg-a', version: '2.0.0' }
    };
    const buildResult = { bundle, status: 'new-version' as const };
    const processor = {
        ...stubPackageProcessor,
        async buildAndPublish() {
            return buildResult;
        },
        async tryBuildAndPublish() {
            return buildResult;
        }
    } as never;
    const capture = { events: [] as unknown[], selected: [] as unknown[] };
    const config = publishableConfig('pkg-a');

    await determineVersionAndPublishAll(
        {
            packageProcessor: processor,
            scheduler: iteratingScheduler(['pkg-a'], capture),
            progressBroadcaster: stubProgressBroadcaster
        },
        config as never,
        [
            {
                name: 'pkg-a',
                analyzedBundle: {
                    name: 'pkg-a',
                    contents: [],
                    roots: {},
                    surface: { mode: 'implicit', defaultModuleRoot: 'main' }
                },
                resolveOptions: {}
            } as never
        ],
        { dryRun: false }
    );

    assert.deepStrictEqual(capture.selected, [bundle]);
    assert.deepStrictEqual(capture.events, [{ version: '2.0.0', status: 'new-version' }]);
});
