import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProgressBroadcaster } from '../../progress/progress-broadcaster.ts';
import { createReportAggregator, type ReportAggregator } from './report-aggregator.ts';

function aggregatorWithEffectiveConfiguration(): ReportAggregator {
    const broadcaster = createProgressBroadcaster();
    const aggregator = createReportAggregator(broadcaster.consumer);
    const opaqueConfiguration: Readonly<Record<string, unknown>> = { name: 'package-a' };
    broadcaster.provider.emit('effectiveConfigurationResolved', {
        packageName: 'package-a',
        configuration: opaqueConfiguration
    });
    return aggregator;
}

function registerArtifactReportTests(): void {
    test('only transformed dead code elimination files contribute changed status when outputs are materialized', function () {
        const broadcaster = createProgressBroadcaster();
        const aggregator = createReportAggregator(broadcaster.consumer);

        broadcaster.provider.emit('artifactsCollected', {
            packageName: 'package-a',
            entries: [
                {
                    path: 'package.json',
                    sizeBytes: 2,
                    kind: 'manifest',
                    status: 'generated',
                    badges: []
                },
                {
                    path: 'index.js',
                    sizeBytes: 20,
                    kind: 'source',
                    sourcePath: '/source/index.js',
                    status: 'unchanged',
                    badges: []
                },
                {
                    path: 'kept.js',
                    sizeBytes: 10,
                    kind: 'source',
                    sourcePath: '/source/kept.js',
                    status: 'unchanged',
                    badges: []
                }
            ]
        });
        broadcaster.provider.emit('eliminationCompleted', {
            perBundle: [
                {
                    packageName: 'package-a',
                    files: [
                        {
                            path: '/source/index.js',
                            decision: 'transformed',
                            reason: 'rewritten-after-analysis',
                            sourceBytes: 30,
                            outputBytes: 20
                        },
                        { path: '/source/kept.js', decision: 'kept', reason: 'reachable', sourceBytes: 10 }
                    ],
                    droppedSymbols: [],
                    seeds: []
                }
            ]
        });

        assert.deepStrictEqual(aggregator.build().packages['package-a']?.outputs?.tarball.entries, [
            {
                path: 'package.json',
                sizeBytes: 2,
                kind: 'manifest',
                status: 'generated',
                badges: []
            },
            {
                path: 'index.js',
                sizeBytes: 20,
                kind: 'source',
                sourcePath: '/source/index.js',
                status: 'changed',
                badges: [ 'dead-code-elimination' ]
            },
            {
                path: 'kept.js',
                sizeBytes: 10,
                kind: 'source',
                sourcePath: '/source/kept.js',
                status: 'unchanged',
                badges: []
            }
        ]);
    });
}

function registerLifecycleTests(): void {
    test('aggregator build() is memoised - second call returns the same object reference', function () {
        const broadcaster = createProgressBroadcaster();
        const aggregator = createReportAggregator(broadcaster.consumer);

        broadcaster.provider.emit('inputsResolved', {
            packageName: 'package-a',
            roots: { main: 'x' },
            sourceFileCount: 0,
            siblingVersions: {}
        });

        const first = aggregator.build();
        const second = aggregator.build();
        assert.strictEqual(first, second);
    });

    test('unsubscribe() stops the aggregator from receiving further events', function () {
        const broadcaster = createProgressBroadcaster();
        const aggregator = createReportAggregator(broadcaster.consumer);

        aggregator.unsubscribe();
        broadcaster.provider.emit('versionDetermined', {
            packageName: 'package-a',
            previousVersion: undefined,
            chosenVersion: '1.0.0',
            trigger: 'initial'
        });

        assert.deepStrictEqual(aggregator.build().packages, {});
    });

    test('aggregator omits inputs / outputs / failure when no related event was received', function () {
        const broadcaster = createProgressBroadcaster();
        const aggregator = createReportAggregator(broadcaster.consumer);

        broadcaster.provider.emit('stageTimed', { packageName: 'package-a', stage: 'build', durationMilliseconds: 5 });

        const packageReport = aggregator.build().packages['package-a'];
        if (packageReport === undefined) {
            assert.fail('expected package-a in report');
        }
        assert.strictEqual(Object.hasOwn(packageReport, 'inputs'), false);
        assert.strictEqual(Object.hasOwn(packageReport, 'outputs'), false);
        assert.strictEqual(Object.hasOwn(packageReport, 'failure'), false);
    });

    test('build() reports schemaVersion 1 on an empty aggregator', function () {
        const broadcaster = createProgressBroadcaster();
        const aggregator = createReportAggregator(broadcaster.consumer);

        assert.strictEqual(aggregator.build().schemaVersion, 1);
    });

    test('build() emits generatedAt as an ISO 8601 timestamp string', function () {
        const broadcaster = createProgressBroadcaster();
        const aggregator = createReportAggregator(broadcaster.consumer);

        const { generatedAt } = aggregator.build();
        assert.match(generatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    test('build() reports an empty packages map when no events were observed', function () {
        const broadcaster = createProgressBroadcaster();
        const aggregator = createReportAggregator(broadcaster.consumer);

        assert.deepStrictEqual(aggregator.build().packages, {});
    });

    test('build() reports aggregate.crossBundleLinks as an empty array', function () {
        const broadcaster = createProgressBroadcaster();
        const aggregator = createReportAggregator(broadcaster.consumer);

        broadcaster.provider.emit('stageTimed', {
            packageName: 'package-a',
            stage: 'publish',
            durationMilliseconds: 1
        });

        assert.deepStrictEqual(aggregator.build().aggregate.crossBundleLinks, []);
    });
}

function registerInputReportTests(): void {
    test('buildInputs() backfills missing roots, siblingVersions, and sourceFileCount when only effectiveConfiguration is set', function () {
        const aggregator = aggregatorWithEffectiveConfiguration();

        assert.deepStrictEqual(aggregator.build().packages['package-a']?.inputs, {
            roots: {},
            siblingVersions: {},
            sourceFileCount: 0,
            effectiveConfiguration: { name: 'package-a' }
        });
    });

    test('buildInputs() omits effectiveConfiguration when only inputsResolved fired', function () {
        const broadcaster = createProgressBroadcaster();
        const aggregator = createReportAggregator(broadcaster.consumer);

        broadcaster.provider.emit('inputsResolved', {
            packageName: 'package-a',
            roots: { main: '/source/index.ts' },
            sourceFileCount: 1,
            siblingVersions: {}
        });

        const inputs = aggregator.build().packages['package-a']?.inputs;
        if (inputs === undefined) {
            assert.fail('expected inputs');
        }
        assert.strictEqual(Object.hasOwn(inputs, 'effectiveConfiguration'), false);
    });

    test('artifactsCollected reports totalBytes 0 for an empty entries list', function () {
        const broadcaster = createProgressBroadcaster();
        const aggregator = createReportAggregator(broadcaster.consumer);

        broadcaster.provider.emit('artifactsCollected', { packageName: 'package-a', entries: [] });

        assert.strictEqual(aggregator.build().packages['package-a']?.outputs?.tarball.totalBytes, 0);
    });

    test('aggregator collects multiple packages independently', function () {
        const broadcaster = createProgressBroadcaster();
        const aggregator = createReportAggregator(broadcaster.consumer);

        broadcaster.provider.emit('stageTimed', {
            packageName: 'package-a',
            stage: 'publish',
            durationMilliseconds: 1
        });
        broadcaster.provider.emit('stageTimed', {
            packageName: 'package-b',
            stage: 'publish',
            durationMilliseconds: 2
        });

        const report = aggregator.build();
        assert.deepStrictEqual(report.packages['package-a']?.timings, { publish: 1 });
        assert.deepStrictEqual(report.packages['package-b']?.timings, { publish: 2 });
    });
}

function registerUnsubscribeTests(): void {
    test('unsubscribe() removes every event subscription', function () {
        const broadcaster = createProgressBroadcaster();
        const aggregator = createReportAggregator(broadcaster.consumer);

        aggregator.unsubscribe();

        for (
            const eventName of [
                'inputsResolved',
                'effectiveConfigurationResolved',
                'versionDetermined',
                'packageManifestAssembled',
                'scanCompleted',
                'linkingCompleted',
                'eliminationCompleted',
                'stageTimed',
                'packageFailed',
                'artifactsCollected'
            ] as const
        ) {
            assert.strictEqual(broadcaster.provider.hasSubscribers(eventName), false);
        }
    });
}

suite('report-aggregator', function () {
    registerArtifactReportTests();
    registerLifecycleTests();
    registerInputReportTests();
    registerUnsubscribeTests();
});
