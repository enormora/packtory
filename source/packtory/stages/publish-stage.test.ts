import assert from 'node:assert';
import { suite, test } from 'mocha';
import { noPublication } from '../../bundle-emitter/publication-outcome.ts';
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
import {
    buildAndPublishResultFixture,
    emptyPublishConfigFixture,
    publishableConfigFixture,
    resolvedPublishPackageFixture,
    versionedPublishBundleFixture
} from '../../test-libraries/publish-stage-fixtures.ts';
import type { PackageProcessor } from '../package-processor.ts';
import { determineVersionAndPublishAll } from './publish-stage.ts';

suite('publish-stage', function () {
    test('determineVersionAndPublishAll returns Ok([]) when no packages are scheduled', async function () {
        const result = await determineVersionAndPublishAll(
            {
                packageProcessor: stubPackageProcessor,
                scheduler: emptyScheduler,
                progressBroadcaster: stubProgressBroadcaster,
                repositoryFolder: '/'
            },
            emptyPublishConfigFixture(),
            [],
            { dryRun: false, stage: false }
        );

        assert.strictEqual(result.isOk, true);
    });

    test('determineVersionAndPublishAll forwards a scheduler failure unchanged', async function () {
        const result = await determineVersionAndPublishAll(
            failingDependencies('boom'),
            emptyPublishConfigFixture(),
            [],
            { dryRun: false, stage: false }
        );

        assert.strictEqual(result.isErr, true);
    });

    test('determineVersionAndPublishAll returns a partial failure when no analyzed bundle is found for a scheduled package', async function () {
        const config = publishableConfigFixture('pkg-orphan');

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
        const bundle = versionedPublishBundleFixture('pkg-a', '2.0.0');
        const published = buildAndPublishResultFixture(bundle);
        const processor: PackageProcessor = {
            ...stubPackageProcessor,
            async buildAndPublish() {
                return published;
            },
            async tryBuildAndPublish() {
                return published;
            }
        };
        const capture: IteratingSchedulerCapture = { events: [] as unknown[], selected: [] as unknown[] };
        const config = publishableConfigFixture('pkg-a');

        await determineVersionAndPublishAll(
            {
                packageProcessor: processor,
                scheduler: iteratingScheduler([ 'pkg-a' ], capture),
                progressBroadcaster: stubProgressBroadcaster,
                repositoryFolder: '/'
            },
            config,
            [ resolvedPublishPackageFixture('pkg-a') ],
            { dryRun: false, stage: false }
        );

        assert.partialDeepStrictEqual(capture, {
            selected: [ bundle ],
            events: [
                { version: '2.0.0', status: 'new-version', publication: noPublication }
            ],
            emitScheduledEvents: false
        });
    });

    test('determineVersionAndPublishAll emits publish package failures to subscribers', async function () {
        const broadcaster = createProgressBroadcaster();
        const failures: unknown[] = [];
        broadcaster.consumer.on('packageFailed', function (payload) {
            failures.push(payload);
        });
        const config = publishableConfigFixture('pkg-a');
        const processor: PackageProcessor = {
            ...stubPackageProcessor,
            async buildAndPublish() {
                throw new Error('publish failed');
            }
        };

        await determineVersionAndPublishAll(
            {
                packageProcessor: processor,
                scheduler: iteratingScheduler([ 'pkg-a' ]),
                progressBroadcaster: broadcaster,
                repositoryFolder: '/'
            },
            config,
            [ resolvedPublishPackageFixture('pkg-a') ],
            { dryRun: false, stage: false }
        );

        assert.deepStrictEqual(failures, [
            { packageName: 'pkg-a', stage: 'publish', message: 'publish failed' }
        ]);
    });
});
