/* eslint-disable @typescript-eslint/consistent-type-assertions -- test stubs cast partial mocks of complex orchestrator types */
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { noPublication } from '../../bundle-emitter/publication-outcome.ts';
import type { PackageConfig, PacktoryConfig } from '../../config/config.ts';
import { buildPackageGraph } from '../../config/package-graph-builder.ts';
import type { ValidConfigResult } from '../../config/validation.ts';
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
import { determineVersionAndPublishAll } from './publish-stage.ts';

suite('publish-stage', function () {
    function packageConfig(name: string): PackageConfig {
        return {
            name,
            roots: { main: { js: 'index.js' } },
            sourcesFolder: '/src',
            mainPackageJson: { type: 'module' },
            publishSettings: { access: 'public' }
        };
    }

    function configWithPackages(packages: readonly PackageConfig[]): ValidConfigResult {
        const packageConfigs: Readonly<Record<string, PackageConfig>> = Object.fromEntries(
            packages.map(function (entry) {
                return [ entry.name, entry ];
            })
        );
        const packtoryConfig: PacktoryConfig = {
            registrySettings: { registryUrl: 'https://example.com', auth: { type: 'bearer-token', token: 'x' } },
            packages
        };

        return { packageConfigs, packtoryConfig, packageGraph: buildPackageGraph(packageConfigs) };
    }

    function emptyConfig(): ValidConfigResult {
        return configWithPackages([]);
    }

    function publishableConfig(name: string): ValidConfigResult {
        return configWithPackages([ packageConfig(name) ]);
    }

    function analyzedBundle(name: string): unknown {
        return {
            name,
            analyzedBundle: {
                name,
                contents: [],
                roots: {},
                surface: { mode: 'implicit', defaultModuleRoot: 'main' }
            },
            resolveOptions: {}
        };
    }

    test('determineVersionAndPublishAll returns Ok([]) when no packages are scheduled', async function () {
        const result = await determineVersionAndPublishAll(
            {
                packageProcessor: stubPackageProcessor,
                scheduler: emptyScheduler,
                progressBroadcaster: stubProgressBroadcaster,
                repositoryFolder: '/'
            },
            emptyConfig(),
            [],
            { dryRun: false, stage: false }
        );

        assert.strictEqual(result.isOk, true);
    });

    test('determineVersionAndPublishAll forwards a scheduler failure unchanged', async function () {
        const result = await determineVersionAndPublishAll(
            failingDependencies('boom'),
            emptyConfig(),
            [],
            { dryRun: false, stage: false }
        );

        assert.strictEqual(result.isErr, true);
    });

    test('determineVersionAndPublishAll returns a partial failure when no analyzed bundle is found for a scheduled package', async function () {
        const config = publishableConfig('pkg-orphan');

        const result = await determineVersionAndPublishAll(
            {
                packageProcessor: stubPackageProcessor,
                scheduler: iteratingScheduler([ 'pkg-orphan' ]),
                progressBroadcaster: stubProgressBroadcaster,
                repositoryFolder: '/'
            },
            config,
            [],
            { dryRun: false, stage: false }
        );

        if (!result.isErr) {
            assert.fail('expected the result to be an error');
        }
        assert.strictEqual(result.error.failures.length, 1);
        assert.match(
            (result.error.failures[0] as Error).message,
            /Analyzed bundle for package "pkg-orphan" is missing/u
        );
    });

    test('determineVersionAndPublishAll exposes the published bundle via selectNext and the version+status via createProgressEvent', async function () {
        const bundle = {
            name: 'pkg-a',
            version: '2.0.0',
            packageJson: { name: 'pkg-a', version: '2.0.0' }
        };
        const buildResult = { bundle, status: 'new-version' as const, publication: noPublication };
        const processor = {
            ...stubPackageProcessor,
            async buildAndPublish() {
                return buildResult;
            },
            async tryBuildAndPublish() {
                return buildResult;
            }
        } as never;
        const capture: IteratingSchedulerCapture = { events: [] as unknown[], selected: [] as unknown[] };
        const config = publishableConfig('pkg-a');

        await determineVersionAndPublishAll(
            {
                packageProcessor: processor,
                scheduler: iteratingScheduler([ 'pkg-a' ], capture),
                progressBroadcaster: stubProgressBroadcaster,
                repositoryFolder: '/'
            },
            config,
            [ analyzedBundle('pkg-a') as never ],
            { dryRun: false, stage: false }
        );

        assert.deepStrictEqual(capture.selected, [ bundle ]);
        assert.deepStrictEqual(capture.events, [
            { version: '2.0.0', status: 'new-version', publication: noPublication }
        ]);
        assert.strictEqual(capture.emitScheduledEvents, false);
    });

    test('determineVersionAndPublishAll emits publish package failures to subscribers', async function () {
        const broadcaster = createProgressBroadcaster();
        const failures: unknown[] = [];
        broadcaster.consumer.on('packageFailed', function (payload) {
            failures.push(payload);
        });
        const config = publishableConfig('pkg-a');
        const processor = {
            ...stubPackageProcessor,
            async buildAndPublish() {
                throw new Error('publish failed');
            }
        } as never;

        await determineVersionAndPublishAll(
            {
                packageProcessor: processor,
                scheduler: iteratingScheduler([ 'pkg-a' ]),
                progressBroadcaster: broadcaster,
                repositoryFolder: '/'
            },
            config,
            [ analyzedBundle('pkg-a') as never ],
            { dryRun: false, stage: false }
        );

        assert.deepStrictEqual(failures, [
            { packageName: 'pkg-a', stage: 'publish', message: 'publish failed' }
        ]);
    });
});
