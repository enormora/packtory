import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProgressBroadcaster } from '../../progress/progress-broadcaster.ts';
import {
    packageConfigurationFixture,
    publicPublishSettings,
    validConfigurationFixture
} from '../../test-libraries/configuration-fixtures.ts';
import { stubPackageProcessor } from '../../test-libraries/orchestrator-stub-fixtures.ts';
import {
    buildAndPublishResultFixture,
    resolvedPublishPackageFixture,
    versionedPublishBundleFixture
} from '../../test-libraries/publish-stage-fixtures.ts';
import { getErrorResult } from '../../test-libraries/result-helpers.ts';
import type { BuildAndPublishResult } from '../package-processor.ts';
import { createScheduler, type PartialError } from '../scheduler.ts';
import { determineVersionAndPublishAll } from './publish-stage.ts';

type FailureStage = 'preparation' | 'publication';
type PackageTerminalStatus = {
    readonly packageName: string;
    readonly status: 'done' | 'error' | 'skipped';
};
type PublishFailureScenario = {
    readonly failure: PartialError<BuildAndPublishResult>;
    readonly events: readonly PackageTerminalStatus[];
    readonly published: readonly string[];
};

async function publishWithFailureAt(failureStage: FailureStage, dryRun: boolean): Promise<PublishFailureScenario> {
    const broadcaster = createProgressBroadcaster();
    const events: PackageTerminalStatus[] = [];
    for (const status of [ 'done', 'error', 'skipped' ] as const) {
        broadcaster.consumer.on(status, function (payload) {
            events.push({ packageName: payload.packageName, status });
        });
    }
    const configuration = validConfigurationFixture({
        commonPackageSettings: { publishSettings: publicPublishSettings },
        packages: [
            packageConfigurationFixture({ name: 'root' }),
            packageConfigurationFixture({ name: 'healthy', bundleDependencies: [ 'root' ] }),
            packageConfigurationFixture({ name: 'failed', bundleDependencies: [ 'root' ] }),
            packageConfigurationFixture({ name: 'dependent', bundleDependencies: [ 'failed' ] })
        ]
    });
    const published: string[] = [];
    const result = await determineVersionAndPublishAll(
        {
            packageProcessor: {
                ...stubPackageProcessor,
                async tryBuildAndPublish(options) {
                    const { name } = options.buildOptions;
                    if (failureStage === 'preparation' && name === 'failed') {
                        throw new Error('preparation failed');
                    }
                    return buildAndPublishResultFixture(versionedPublishBundleFixture(name, '1.0.0'));
                },
                async publishPreparedPackage(options, prepared) {
                    const { name } = options.buildOptions;
                    published.push(name);
                    if (failureStage === 'publication' && name === 'failed') {
                        throw new Error('publication failed');
                    }
                    return prepared;
                }
            },
            scheduler: createScheduler({ progressBroadcastProvider: broadcaster.provider }),
            progressBroadcaster: broadcaster,
            repositoryFolder: '/'
        },
        configuration,
        configuration.packtoryConfiguration.packages.map(function (entry) {
            return resolvedPublishPackageFixture(entry.name);
        }),
        { dryRun, stage: false }
    );
    return { failure: getErrorResult(result, 'Expected a partial failure'), events, published };
}

suite('publish-stage skipped packages', function () {
    for (const dryRun of [ true, false ]) {
        test(`accounts for every package after preparation fails with dryRun=${dryRun}`, async function () {
            const { failure, events, published } = await publishWithFailureAt('preparation', dryRun);

            assert.deepStrictEqual(published, []);
            assert.strictEqual(failure.failures[0]?.message, 'preparation failed');
            assert.deepStrictEqual(
                failure.succeeded.map(function (entry) {
                    return entry.bundle.name;
                }),
                dryRun ? [ 'root', 'healthy' ] : []
            );
            assert.deepStrictEqual(
                failure.skipped,
                dryRun
                    ? [
                        { packageName: 'dependent', reason: 'An earlier dependency generation failed' }
                    ]
                    : [
                        { packageName: 'root', reason: 'Publishing stopped because package preparation failed' },
                        { packageName: 'healthy', reason: 'Publishing stopped because package preparation failed' },
                        { packageName: 'dependent', reason: 'An earlier dependency generation failed' }
                    ]
            );
            assert.deepStrictEqual(
                events.toSorted(function (left, right) {
                    return left.packageName.localeCompare(right.packageName);
                }),
                [
                    { packageName: 'dependent', status: 'skipped' },
                    { packageName: 'failed', status: 'error' },
                    { packageName: 'healthy', status: dryRun ? 'done' : 'skipped' },
                    { packageName: 'root', status: dryRun ? 'done' : 'skipped' }
                ]
            );
        });
    }

    test('accounts for every package after publication fails', async function () {
        const { failure, events, published } = await publishWithFailureAt('publication', false);

        assert.deepStrictEqual(published, [ 'root', 'healthy', 'failed' ]);
        assert.strictEqual(failure.failures[0]?.message, 'publication failed');
        assert.deepStrictEqual(
            failure.succeeded.map(function (entry) {
                return entry.bundle.name;
            }),
            [ 'root', 'healthy' ]
        );
        assert.deepStrictEqual(failure.skipped, [
            { packageName: 'dependent', reason: 'An earlier dependency generation failed' }
        ]);
        assert.deepStrictEqual(
            events.toSorted(function (left, right) {
                return left.packageName.localeCompare(right.packageName);
            }),
            [
                { packageName: 'dependent', status: 'skipped' },
                { packageName: 'failed', status: 'error' },
                { packageName: 'healthy', status: 'done' },
                { packageName: 'root', status: 'done' }
            ]
        );
    });
});
