/* eslint-disable @typescript-eslint/consistent-type-assertions -- test stubs cast partial mocks of complex orchestrator types */
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { noPublication } from '../../bundle-emitter/publication-outcome.ts';
import { createIteratingScheduler as iteratingScheduler } from '../../test-libraries/iterating-scheduler.ts';
import {
    emptyScheduler,
    failingDependencies,
    stubPackageProcessor,
    stubProgressBroadcaster
} from '../../test-libraries/orchestrator-stub-fixtures.ts';
import { determineVersionAndPublishAll } from './publish-stage.ts';

suite('publish-stage', function () {
    test('determineVersionAndPublishAll returns Ok([]) when no packages are scheduled', async function () {
        const result = await determineVersionAndPublishAll(
            {
                packageProcessor: stubPackageProcessor,
                scheduler: emptyScheduler,
                progressBroadcaster: stubProgressBroadcaster
            },
            { packageConfigs: {}, packtoryConfig: { packages: [] } } as never,
            [],
            { dryRun: false, stage: false }
        );

        assert.strictEqual(result.isOk, true);
    });

    test('determineVersionAndPublishAll forwards a scheduler failure unchanged', async function () {
        const result = await determineVersionAndPublishAll(
            failingDependencies('boom'),
            { packageConfigs: {}, packtoryConfig: { packages: [] } } as never,
            [],
            { dryRun: false, stage: false }
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

    test('determineVersionAndPublishAll returns a partial failure when no analyzed bundle is found for a scheduled package', async function () {
        const config = publishableConfig('pkg-orphan');

        const result = await determineVersionAndPublishAll(
            {
                packageProcessor: stubPackageProcessor,
                scheduler: iteratingScheduler(['pkg-orphan']),
                progressBroadcaster: stubProgressBroadcaster
            },
            config as never,
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
            { dryRun: false, stage: false }
        );

        assert.deepStrictEqual(capture.selected, [bundle]);
        assert.deepStrictEqual(capture.events, [
            { version: '2.0.0', status: 'new-version', publication: noPublication }
        ]);
    });
});
