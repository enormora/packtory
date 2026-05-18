import assert from 'node:assert';
import { test } from 'mocha';
import { createProgressBroadcaster } from '../../progress/progress-broadcaster.ts';
import { createReportAggregator } from './report-aggregator.ts';

test('only transformed DCE files contribute changed status when outputs are materialized', () => {
    const broadcaster = createProgressBroadcaster();
    const aggregator = createReportAggregator(broadcaster.consumer);

    broadcaster.provider.emit('artifactsCollected', {
        packageName: 'pkg-a',
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
                sourcePath: '/src/index.js',
                status: 'unchanged',
                badges: []
            },
            {
                path: 'kept.js',
                sizeBytes: 10,
                kind: 'source',
                sourcePath: '/src/kept.js',
                status: 'unchanged',
                badges: []
            }
        ]
    });
    broadcaster.provider.emit('eliminationCompleted', {
        perBundle: [
            {
                packageName: 'pkg-a',
                files: [
                    {
                        path: '/src/index.js',
                        decision: 'transformed',
                        reason: 'rewritten-after-analysis',
                        sourceBytes: 30,
                        outputBytes: 20
                    },
                    { path: '/src/kept.js', decision: 'kept', reason: 'reachable', sourceBytes: 10 }
                ],
                droppedSymbols: [],
                seeds: []
            }
        ]
    });

    assert.deepStrictEqual(aggregator.build().packages['pkg-a']?.outputs?.tarball.entries, [
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
            sourcePath: '/src/index.js',
            status: 'changed',
            badges: ['dead-code-elimination']
        },
        {
            path: 'kept.js',
            sizeBytes: 10,
            kind: 'source',
            sourcePath: '/src/kept.js',
            status: 'unchanged',
            badges: []
        }
    ]);
});

test('aggregator build() is memoised - second call returns the same object reference', () => {
    const broadcaster = createProgressBroadcaster();
    const aggregator = createReportAggregator(broadcaster.consumer);

    broadcaster.provider.emit('inputsResolved', {
        packageName: 'pkg-a',
        roots: { main: 'x' },
        sourceFileCount: 0,
        siblingVersions: {}
    });

    const first = aggregator.build();
    const second = aggregator.build();
    assert.strictEqual(first, second);
});

test('unsubscribe() stops the aggregator from receiving further events', () => {
    const broadcaster = createProgressBroadcaster();
    const aggregator = createReportAggregator(broadcaster.consumer);

    aggregator.unsubscribe();
    broadcaster.provider.emit('versionDetermined', {
        packageName: 'pkg-a',
        previousVersion: undefined,
        chosenVersion: '1.0.0',
        trigger: 'initial'
    });

    assert.deepStrictEqual(aggregator.build().packages, {});
});

test('aggregator omits inputs / outputs / failure when no related event was received', () => {
    const broadcaster = createProgressBroadcaster();
    const aggregator = createReportAggregator(broadcaster.consumer);

    broadcaster.provider.emit('stageTimed', { packageName: 'pkg-a', stage: 'build', durationMs: 5 });

    const pkg = aggregator.build().packages['pkg-a'];
    if (pkg === undefined) {
        assert.fail('expected pkg-a in report');
    }
    assert.strictEqual('inputs' in pkg, false);
    assert.strictEqual('outputs' in pkg, false);
    assert.strictEqual('failure' in pkg, false);
});

test('build() reports schemaVersion 1 on an empty aggregator', () => {
    const broadcaster = createProgressBroadcaster();
    const aggregator = createReportAggregator(broadcaster.consumer);

    assert.strictEqual(aggregator.build().schemaVersion, 1);
});

test('build() emits generatedAt as an ISO 8601 timestamp string', () => {
    const broadcaster = createProgressBroadcaster();
    const aggregator = createReportAggregator(broadcaster.consumer);

    const { generatedAt } = aggregator.build();
    assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(generatedAt));
});

test('build() reports an empty packages map when no events were observed', () => {
    const broadcaster = createProgressBroadcaster();
    const aggregator = createReportAggregator(broadcaster.consumer);

    assert.deepStrictEqual(aggregator.build().packages, {});
});

test('build() reports aggregate.crossBundleLinks as an empty array', () => {
    const broadcaster = createProgressBroadcaster();
    const aggregator = createReportAggregator(broadcaster.consumer);

    broadcaster.provider.emit('stageTimed', { packageName: 'pkg-a', stage: 'publish', durationMs: 1 });

    assert.deepStrictEqual(aggregator.build().aggregate.crossBundleLinks, []);
});

function aggregatorWithEffectiveConfig(): ReturnType<typeof createReportAggregator> {
    const broadcaster = createProgressBroadcaster();
    const aggregator = createReportAggregator(broadcaster.consumer);
    const opaqueConfig: Readonly<Record<string, unknown>> = { name: 'pkg-a' };
    broadcaster.provider.emit('effectiveConfigResolved', {
        packageName: 'pkg-a',
        config: opaqueConfig
    });
    return aggregator;
}

test('buildInputs() backfills missing roots, siblingVersions, and sourceFileCount when only effectiveConfig is set', () => {
    const aggregator = aggregatorWithEffectiveConfig();

    assert.deepStrictEqual(aggregator.build().packages['pkg-a']?.inputs, {
        roots: {},
        siblingVersions: {},
        sourceFileCount: 0,
        effectiveConfig: { name: 'pkg-a' }
    });
});

test('buildInputs() omits effectiveConfig when only inputsResolved fired', () => {
    const broadcaster = createProgressBroadcaster();
    const aggregator = createReportAggregator(broadcaster.consumer);

    broadcaster.provider.emit('inputsResolved', {
        packageName: 'pkg-a',
        roots: { main: '/src/index.ts' },
        sourceFileCount: 1,
        siblingVersions: {}
    });

    const inputs = aggregator.build().packages['pkg-a']?.inputs;
    if (inputs === undefined) {
        assert.fail('expected inputs');
    }
    assert.strictEqual('effectiveConfig' in inputs, false);
});

test('artifactsCollected reports totalBytes 0 for an empty entries list', () => {
    const broadcaster = createProgressBroadcaster();
    const aggregator = createReportAggregator(broadcaster.consumer);

    broadcaster.provider.emit('artifactsCollected', { packageName: 'pkg-a', entries: [] });

    assert.strictEqual(aggregator.build().packages['pkg-a']?.outputs?.tarball.totalBytes, 0);
});

test('aggregator collects multiple packages independently', () => {
    const broadcaster = createProgressBroadcaster();
    const aggregator = createReportAggregator(broadcaster.consumer);

    broadcaster.provider.emit('stageTimed', { packageName: 'pkg-a', stage: 'publish', durationMs: 1 });
    broadcaster.provider.emit('stageTimed', { packageName: 'pkg-b', stage: 'publish', durationMs: 2 });

    const report = aggregator.build();
    assert.deepStrictEqual(report.packages['pkg-a']?.timings, { publish: 1 });
    assert.deepStrictEqual(report.packages['pkg-b']?.timings, { publish: 2 });
});

test('unsubscribe() removes every event subscription', () => {
    const broadcaster = createProgressBroadcaster();
    const aggregator = createReportAggregator(broadcaster.consumer);

    aggregator.unsubscribe();

    assert.strictEqual(broadcaster.provider.hasSubscribers('inputsResolved'), false);
    assert.strictEqual(broadcaster.provider.hasSubscribers('effectiveConfigResolved'), false);
    assert.strictEqual(broadcaster.provider.hasSubscribers('versionDetermined'), false);
    assert.strictEqual(broadcaster.provider.hasSubscribers('packageJsonAssembled'), false);
    assert.strictEqual(broadcaster.provider.hasSubscribers('scanCompleted'), false);
    assert.strictEqual(broadcaster.provider.hasSubscribers('linkingCompleted'), false);
    assert.strictEqual(broadcaster.provider.hasSubscribers('eliminationCompleted'), false);
    assert.strictEqual(broadcaster.provider.hasSubscribers('stageTimed'), false);
    assert.strictEqual(broadcaster.provider.hasSubscribers('packageFailed'), false);
    assert.strictEqual(broadcaster.provider.hasSubscribers('artifactsCollected'), false);
});
