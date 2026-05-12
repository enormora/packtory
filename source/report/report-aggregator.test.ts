import assert from 'node:assert';
import { test } from 'mocha';
import { createProgressBroadcaster } from '../progress/progress-broadcaster.ts';
import { createReportAggregator } from './report-aggregator.ts';

test('aggregator captures inputsResolved into the package report', () => {
    const broadcaster = createProgressBroadcaster();
    const aggregator = createReportAggregator(broadcaster.consumer);

    broadcaster.provider.emit('inputsResolved', {
        packageName: 'pkg-a',
        entryPoints: ['/src/index.ts'],
        sourceFileCount: 42,
        siblingVersions: { 'pkg-b': '1.0.0' }
    });

    const report = aggregator.build();
    assert.deepStrictEqual(report.packages['pkg-a']?.inputs, {
        entryPoints: ['/src/index.ts'],
        sourceFileCount: 42,
        siblingVersions: { 'pkg-b': '1.0.0' }
    });
});

test('aggregator captures versionDetermined into decisions.version', () => {
    const broadcaster = createProgressBroadcaster();
    const aggregator = createReportAggregator(broadcaster.consumer);

    broadcaster.provider.emit('versionDetermined', {
        packageName: 'pkg-a',
        previousVersion: '1.0.0',
        chosenVersion: '1.0.1',
        trigger: 'auto-patch-bump'
    });

    assert.deepStrictEqual(aggregator.build().packages['pkg-a']?.decisions.version, {
        previousVersion: '1.0.0',
        chosenVersion: '1.0.1',
        trigger: 'auto-patch-bump'
    });
});

test('aggregator aggregates stageTimed events by stage name', () => {
    const broadcaster = createProgressBroadcaster();
    const aggregator = createReportAggregator(broadcaster.consumer);

    broadcaster.provider.emit('stageTimed', { packageName: 'pkg-a', stage: 'resolveAndLink', durationMs: 12.5 });
    broadcaster.provider.emit('stageTimed', { packageName: 'pkg-a', stage: 'publish', durationMs: 7.25 });

    const timings = aggregator.build().packages['pkg-a']?.timings;
    assert.deepStrictEqual(timings, { resolveAndLink: 12.5, publish: 7.25 });
});

test('aggregator captures packageJsonAssembled fields', () => {
    const broadcaster = createProgressBroadcaster();
    const aggregator = createReportAggregator(broadcaster.consumer);

    broadcaster.provider.emit('packageJsonAssembled', {
        packageName: 'pkg-a',
        fields: { name: { source: 'derived' }, type: { source: 'mainPackageJson' } }
    });

    assert.deepStrictEqual(aggregator.build().packages['pkg-a']?.decisions.packageJson, {
        name: { source: 'derived' },
        type: { source: 'mainPackageJson' }
    });
});

test('aggregator captures artifactsCollected entries and computes totalBytes', () => {
    const broadcaster = createProgressBroadcaster();
    const aggregator = createReportAggregator(broadcaster.consumer);

    broadcaster.provider.emit('artifactsCollected', {
        packageName: 'pkg-a',
        entries: [
            { path: 'package.json', sizeBytes: 50, kind: 'manifest' },
            { path: 'index.js', sizeBytes: 100, kind: 'source' }
        ]
    });

    const tarball = aggregator.build().packages['pkg-a']?.outputs?.tarball;
    if (tarball === undefined) {
        assert.fail('expected tarball outputs');
    }
    assert.strictEqual(tarball.totalBytes, 150);
    assert.strictEqual(tarball.entries.length, 2);
});

test('aggregator build() is memoised - second call returns the same object reference', () => {
    const broadcaster = createProgressBroadcaster();
    const aggregator = createReportAggregator(broadcaster.consumer);

    broadcaster.provider.emit('inputsResolved', {
        packageName: 'pkg-a',
        entryPoints: ['x'],
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
