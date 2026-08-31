import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Result } from 'true-myth';
import { createProgressBroadcaster } from '../../progress/progress-broadcaster.ts';
import {
    createIteratingScheduler as iteratingScheduler,
    type IteratingSchedulerCapture
} from '../../test-libraries/iterating-scheduler.ts';
import {
    stubPackageProcessor,
    stubProgressBroadcaster
} from '../../test-libraries/orchestrator-stub-fixtures.ts';
import {
    buildAndPublishResultFixture,
    publishableConfigFixture,
    publishableConfigFixtures,
    resolvedPublishPackageFixture,
    versionedPublishBundleFixture
} from '../../test-libraries/publish-stage-fixtures.ts';
import type { BuildAndPublishResult, PackageProcessor } from '../package-processor.ts';
import { determineVersionAndPublishAll, type PublishStageDependencies } from './publish-stage.ts';

type ProcessorScenario = {
    readonly bundle: BuildAndPublishResult['bundle'];
    readonly prepared: BuildAndPublishResult;
    readonly processor: PackageProcessor;
    readonly publishPreparedPackage: ReturnType<typeof fake.resolves>;
};
type PublishStageScheduler = PublishStageDependencies['scheduler'];
type MissingPreparedSchedulerConfig = Parameters<PublishStageScheduler['runForEachScheduledPackage']>[0]['config'];
type MissingPreparedSchedulerContext = {
    readonly packageName: string;
    readonly existing: readonly unknown[];
    readonly config: MissingPreparedSchedulerConfig;
};
type MissingPreparedSchedulerInput = {
    readonly config: MissingPreparedSchedulerConfig;
    readonly createOptions: (context: MissingPreparedSchedulerContext) => unknown;
    readonly execute: (options: unknown) => Promise<unknown>;
};

function createSuccessfulPreflightProcessor(): ProcessorScenario {
    const bundle = versionedPublishBundleFixture('pkg-a', '2.0.0');
    const prepared = buildAndPublishResultFixture(bundle);
    const publishPreparedPackage = fake.resolves(prepared);
    return {
        bundle,
        prepared,
        processor: {
            ...stubPackageProcessor,
            async tryBuildAndPublish() {
                return prepared;
            },
            publishPreparedPackage
        },
        publishPreparedPackage
    };
}

function createFailingPreflightProcessor(): ProcessorScenario {
    const bundle = versionedPublishBundleFixture('pkg-a', '2.0.0');
    let preflightAttempt = 0;
    const publishPreparedPackage = fake.resolves(buildAndPublishResultFixture(bundle));
    return {
        bundle,
        prepared: buildAndPublishResultFixture(bundle),
        processor: {
            ...stubPackageProcessor,
            async tryBuildAndPublish() {
                preflightAttempt += 1;
                if (preflightAttempt === 2) {
                    throw new Error('target version collision');
                }
                return buildAndPublishResultFixture(bundle);
            },
            publishPreparedPackage
        },
        publishPreparedPackage
    };
}

function toError(error: unknown): Error {
    if (error instanceof Error) {
        return error;
    }
    return new Error('Unknown error');
}

function createMissingPreparedScheduler(): PublishStageScheduler {
    let callCount = 0;
    const scheduler = {
        async runForEachScheduledPackage(input: MissingPreparedSchedulerInput) {
            callCount += 1;
            const packageName = callCount === 1 ? 'pkg-a' : 'pkg-b';
            const options = input.createOptions({ packageName, existing: [], config: input.config });
            try {
                const result = await input.execute(options);
                return Result.ok([ result ]);
            } catch (error: unknown) {
                return Result.err({ succeeded: [], failures: [ toError(error) ] });
            }
        }
    };
    return scheduler as unknown as PublishStageScheduler;
}

suite('publish-stage preflight', function () {
    test('determineVersionAndPublishAll publishes prepared results after successful preflight', async function () {
        const { bundle, prepared, processor, publishPreparedPackage } = createSuccessfulPreflightProcessor();
        const capture: IteratingSchedulerCapture = { events: [] as unknown[], selected: [] as unknown[] };
        const config = publishableConfigFixture('pkg-a');

        const result = await determineVersionAndPublishAll(
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

        assert.strictEqual(result.isOk, true);
        assert.strictEqual(publishPreparedPackage.callCount, 1);
        assert.strictEqual(publishPreparedPackage.firstCall.args[1], prepared);
        assert.partialDeepStrictEqual(capture, {
            selected: [ bundle, bundle ],
            events: [
                { version: '2.0.0', status: 'new-version', publication: { type: 'none' } }
            ],
            emitScheduledEvents: false
        });
    });

    test('determineVersionAndPublishAll does not publish any package when preflight fails', async function () {
        const { processor, publishPreparedPackage } = createFailingPreflightProcessor();
        const configWithTwoPackages = publishableConfigFixtures([ 'pkg-a', 'pkg-b' ]);

        const result = await determineVersionAndPublishAll(
            {
                packageProcessor: processor,
                scheduler: iteratingScheduler([ 'pkg-a', 'pkg-b' ]),
                progressBroadcaster: stubProgressBroadcaster,
                repositoryFolder: '/'
            },
            configWithTwoPackages,
            [ resolvedPublishPackageFixture('pkg-a'), resolvedPublishPackageFixture('pkg-b') ],
            { dryRun: false, stage: false }
        );

        if (!result.isErr) {
            assert.fail('expected preflight failure');
        }
        assert.strictEqual(publishPreparedPackage.callCount, 0);
        assert.deepStrictEqual(result.error.succeeded, []);
        assert.strictEqual(result.error.failures[0]?.message, 'target version collision');
    });

    test('determineVersionAndPublishAll emits prepared publish failures to subscribers', async function () {
        const { prepared, processor } = createSuccessfulPreflightProcessor();
        const broadcaster = createProgressBroadcaster();
        const failures: unknown[] = [];
        broadcaster.consumer.on('packageFailed', function (payload) {
            failures.push(payload);
        });
        const failingProcessor: PackageProcessor = {
            ...processor,
            publishPreparedPackage: fake.rejects(new Error('prepared publish failed'))
        };

        await determineVersionAndPublishAll(
            {
                packageProcessor: failingProcessor,
                scheduler: iteratingScheduler([ 'pkg-a' ]),
                progressBroadcaster: broadcaster,
                repositoryFolder: '/'
            },
            publishableConfigFixture('pkg-a'),
            [ resolvedPublishPackageFixture('pkg-a') ],
            { dryRun: false, stage: false }
        );

        assert.strictEqual(prepared.bundle.name, 'pkg-a');
        assert.deepStrictEqual(failures, [
            { packageName: 'pkg-a', stage: 'publish', message: 'prepared publish failed' }
        ]);
    });

    test('determineVersionAndPublishAll fails when a scheduled package has no prepared result', async function () {
        const { processor } = createSuccessfulPreflightProcessor();
        const configWithTwoPackages = publishableConfigFixtures([ 'pkg-a', 'pkg-b' ]);

        const result = await determineVersionAndPublishAll(
            {
                packageProcessor: processor,
                scheduler: createMissingPreparedScheduler(),
                progressBroadcaster: stubProgressBroadcaster,
                repositoryFolder: '/'
            },
            configWithTwoPackages,
            [ resolvedPublishPackageFixture('pkg-a'), resolvedPublishPackageFixture('pkg-b') ],
            { dryRun: false, stage: false }
        );

        if (!result.isErr) {
            assert.fail('expected missing prepared failure');
        }
        assert.strictEqual(
            result.error.failures[0]?.message,
            'Prepared publish for package "pkg-b" is missing'
        );
    });
});
