import assert from 'node:assert';
import { test } from 'mocha';
import { createProgressBroadcaster } from '../progress/progress-broadcaster.ts';
import { mergeArtifactEntry } from './artifact-entry-merger.ts';
import { createReportAggregator } from './report-aggregator.ts';

test('aggregator captures inputsResolved into the package report', () => {
    const broadcaster = createProgressBroadcaster();
    const aggregator = createReportAggregator(broadcaster.consumer);

    broadcaster.provider.emit('inputsResolved', {
        packageName: 'pkg-a',
        roots: { main: '/src/index.ts' },
        sourceFileCount: 42,
        siblingVersions: { 'pkg-b': '1.0.0' }
    });

    const report = aggregator.build();
    assert.deepStrictEqual(report.packages['pkg-a']?.inputs, {
        roots: { main: '/src/index.ts' },
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
            { path: 'package.json', sizeBytes: 50, kind: 'manifest', status: 'generated', badges: [] },
            {
                path: 'index.js',
                sizeBytes: 100,
                kind: 'source',
                sourcePath: '/src/index.js',
                status: 'unchanged',
                badges: []
            }
        ]
    });

    const tarball = aggregator.build().packages['pkg-a']?.outputs?.tarball;
    if (tarball === undefined) {
        assert.fail('expected tarball outputs');
    }
    assert.strictEqual(tarball.totalBytes, 150);
    assert.strictEqual(tarball.entries.length, 2);
});

test('mergeArtifactEntry preserves artifacts without source paths and only marks transformed files as changed', () => {
    const manifest = { path: 'package.json', sizeBytes: 2, kind: 'manifest', status: 'generated', badges: [] } as const;

    assert.strictEqual(mergeArtifactEntry(manifest, new Set(['/src/index.js']), new Set(['/src/index.js'])), manifest);
    assert.deepStrictEqual(
        mergeArtifactEntry(
            {
                path: 'index.js',
                sizeBytes: 20,
                kind: 'source',
                sourcePath: '/src/index.js',
                status: 'unchanged',
                badges: []
            },
            new Set<string>(),
            new Set(['/src/index.js'])
        ),
        {
            path: 'index.js',
            sizeBytes: 20,
            kind: 'source',
            sourcePath: '/src/index.js',
            status: 'changed',
            badges: ['dead-code-elimination']
        }
    );
});

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

function aggregatorWithBroadcaster() {
    const broadcaster = createProgressBroadcaster();
    return {
        broadcaster,
        aggregator: createReportAggregator(broadcaster.consumer)
    };
}

function emitCollectedSourceArtifact(
    broadcaster: ReturnType<typeof createProgressBroadcaster>,
    entry: {
        readonly status: 'changed' | 'unchanged';
        readonly badges: readonly ('dead-code-elimination' | 'import-path-rewrite')[];
    }
): void {
    broadcaster.provider.emit('artifactsCollected', {
        packageName: 'pkg-a',
        entries: [
            {
                path: 'index.js',
                sizeBytes: 20,
                kind: 'source',
                sourcePath: '/src/index.js',
                status: entry.status,
                badges: entry.badges
            }
        ]
    });
}

function emitTransformedElimination(broadcaster: ReturnType<typeof createProgressBroadcaster>): void {
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
                    }
                ],
                droppedSymbols: [],
                seeds: []
            }
        ]
    });
}

function expectSingleMergedArtifact(
    aggregator: ReturnType<typeof createReportAggregator>,
    badges: readonly ('dead-code-elimination' | 'import-path-rewrite')[]
): void {
    assert.deepStrictEqual(aggregator.build().packages['pkg-a']?.outputs?.tarball.entries, [
        {
            path: 'index.js',
            sizeBytes: 20,
            kind: 'source',
            sourcePath: '/src/index.js',
            status: 'changed',
            badges
        }
    ]);
}

test('effectiveConfigResolved records the redacted config under inputs.effectiveConfig', () => {
    const aggregator = aggregatorWithEffectiveConfig();

    assert.deepStrictEqual(aggregator.build().packages['pkg-a']?.inputs?.effectiveConfig, { name: 'pkg-a' });
});

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

test('scanCompleted records included and excluded entries under decisions.dependencyScan', () => {
    const broadcaster = createProgressBroadcaster();
    const aggregator = createReportAggregator(broadcaster.consumer);

    broadcaster.provider.emit('scanCompleted', {
        packageName: 'pkg-a',
        included: [{ path: '/src/a.ts', reason: 'reachable-from-entry' }],
        excluded: [{ specifier: 'lodash', reason: 'external-module' }]
    });

    assert.deepStrictEqual(aggregator.build().packages['pkg-a']?.decisions.dependencyScan, {
        included: [{ path: '/src/a.ts', reason: 'reachable-from-entry' }],
        excluded: [{ specifier: 'lodash', reason: 'external-module' }]
    });
});

test('linkingCompleted records rewrites under decisions.linker', () => {
    const broadcaster = createProgressBroadcaster();
    const aggregator = createReportAggregator(broadcaster.consumer);

    broadcaster.provider.emit('linkingCompleted', {
        packageName: 'pkg-a',
        rewrites: [{ file: '/src/a.ts', fromSpecifier: '/src/a.ts', toSpecifier: 'pkg-b', targetBundle: 'pkg-b' }]
    });

    assert.deepStrictEqual(aggregator.build().packages['pkg-a']?.decisions.linker, {
        rewrites: [{ file: '/src/a.ts', fromSpecifier: '/src/a.ts', toSpecifier: 'pkg-b', targetBundle: 'pkg-b' }]
    });
});

test('eliminationCompleted assigns each perBundle entry to its own package', () => {
    const broadcaster = createProgressBroadcaster();
    const aggregator = createReportAggregator(broadcaster.consumer);

    broadcaster.provider.emit('eliminationCompleted', {
        perBundle: [
            {
                packageName: 'pkg-a',
                files: [{ path: '/src/a.ts', decision: 'kept', reason: 'reachable', sourceBytes: 1 }],
                droppedSymbols: [],
                seeds: []
            },
            {
                packageName: 'pkg-b',
                files: [
                    { path: '/src/b.ts', decision: 'kept', reason: 'reachable', sourceBytes: 1 },
                    { path: '/src/c.ts', decision: 'eliminated', reason: 'not-emitted-after-analysis', sourceBytes: 2 }
                ],
                droppedSymbols: [{ file: '/src/b.ts', symbolName: 'x', kind: 'function', reason: 'unused' }],
                seeds: [{ binding: 'shared', sourceBundle: 'pkg-a', consumerBundle: 'pkg-b', gatedBy: 'import' }]
            }
        ]
    });

    const report = aggregator.build();
    const pkgA = report.packages['pkg-a'];
    const pkgB = report.packages['pkg-b'];
    const decisionsA = pkgA?.decisions.deadCodeElimination;
    const decisionsB = pkgB?.decisions.deadCodeElimination;
    if (decisionsA === undefined || decisionsB === undefined) {
        assert.fail('expected deadCodeElimination decisions on both pkg-a and pkg-b');
    }
    assert.deepStrictEqual(decisionsA.symbols, []);
    assert.deepStrictEqual(decisionsA.seeds, []);
    assert.deepStrictEqual(decisionsB.symbols, [
        { file: '/src/b.ts', symbolName: 'x', kind: 'function', reason: 'unused' }
    ]);
    assert.deepStrictEqual(decisionsB.files, [
        {
            path: '/src/b.ts',
            decision: 'kept',
            reason: 'reachable',
            sourceBytes: 1
        }
    ]);
    assert.deepStrictEqual(decisionsB.seeds, [
        { binding: 'shared', sourceBundle: 'pkg-a', consumerBundle: 'pkg-b', gatedBy: 'import' }
    ]);
    assert.deepStrictEqual(pkgB?.eliminatedSourceFiles, [
        { path: '/src/c.ts', reason: 'not-emitted-after-analysis', sourceBytes: 2 }
    ]);
});

test('packageFailed records the stage name and message', () => {
    const broadcaster = createProgressBroadcaster();
    const aggregator = createReportAggregator(broadcaster.consumer);

    broadcaster.provider.emit('packageFailed', {
        packageName: 'pkg-a',
        stage: 'publish',
        message: 'boom'
    });

    assert.deepStrictEqual(aggregator.build().packages['pkg-a']?.failure, { stage: 'publish', message: 'boom' });
});

test('artifactsCollected reports totalBytes 0 for an empty entries list', () => {
    const broadcaster = createProgressBroadcaster();
    const aggregator = createReportAggregator(broadcaster.consumer);

    broadcaster.provider.emit('artifactsCollected', { packageName: 'pkg-a', entries: [] });

    assert.strictEqual(aggregator.build().packages['pkg-a']?.outputs?.tarball.totalBytes, 0);
});

test('artifacts are marked changed and gain a DCE badge when elimination reported a transformed file', () => {
    const { broadcaster, aggregator } = aggregatorWithBroadcaster();

    emitCollectedSourceArtifact(broadcaster, { status: 'unchanged', badges: [] });
    emitTransformedElimination(broadcaster);

    expectSingleMergedArtifact(aggregator, ['dead-code-elimination']);
});

test('artifacts merge import rewrite badges with transformed status', () => {
    const { broadcaster, aggregator } = aggregatorWithBroadcaster();

    emitCollectedSourceArtifact(broadcaster, { status: 'changed', badges: ['import-path-rewrite'] });
    broadcaster.provider.emit('linkingCompleted', {
        packageName: 'pkg-a',
        rewrites: [{ file: '/src/index.js', fromSpecifier: './dep.js', toSpecifier: 'pkg-b', targetBundle: 'pkg-b' }]
    });
    emitTransformedElimination(broadcaster);

    expectSingleMergedArtifact(aggregator, ['import-path-rewrite', 'dead-code-elimination']);
});

test('artifacts gain an import rewrite badge and changed status when linking rewrites the source file', () => {
    const { broadcaster, aggregator } = aggregatorWithBroadcaster();

    emitCollectedSourceArtifact(broadcaster, { status: 'unchanged', badges: [] });
    broadcaster.provider.emit('linkingCompleted', {
        packageName: 'pkg-a',
        rewrites: [{ file: '/src/index.js', fromSpecifier: './dep.js', toSpecifier: 'pkg-b', targetBundle: 'pkg-b' }]
    });

    expectSingleMergedArtifact(aggregator, ['import-path-rewrite']);
});

test('artifacts without source paths stay unchanged when merge metadata is applied', () => {
    const broadcaster = createProgressBroadcaster();
    const aggregator = createReportAggregator(broadcaster.consumer);

    broadcaster.provider.emit('artifactsCollected', {
        packageName: 'pkg-a',
        entries: [{ path: 'package.json', sizeBytes: 5, kind: 'manifest', status: 'generated', badges: [] }]
    });
    broadcaster.provider.emit('linkingCompleted', {
        packageName: 'pkg-a',
        rewrites: [{ file: '/src/index.js', fromSpecifier: './dep.js', toSpecifier: 'pkg-b', targetBundle: 'pkg-b' }]
    });
    emitTransformedElimination(broadcaster);

    assert.deepStrictEqual(aggregator.build().packages['pkg-a']?.outputs?.tarball.entries, [
        { path: 'package.json', sizeBytes: 5, kind: 'manifest', status: 'generated', badges: [] }
    ]);
});

test('eliminatedSourceFiles preserves outputBytes when present', () => {
    const broadcaster = createProgressBroadcaster();
    const aggregator = createReportAggregator(broadcaster.consumer);

    broadcaster.provider.emit('eliminationCompleted', {
        perBundle: [
            {
                packageName: 'pkg-a',
                files: [
                    {
                        path: '/src/index.js',
                        decision: 'eliminated',
                        reason: 'not-emitted-after-analysis',
                        sourceBytes: 30,
                        outputBytes: 0
                    }
                ],
                droppedSymbols: [],
                seeds: []
            }
        ]
    });

    assert.deepStrictEqual(aggregator.build().packages['pkg-a']?.eliminatedSourceFiles, [
        {
            path: '/src/index.js',
            reason: 'not-emitted-after-analysis',
            sourceBytes: 30,
            outputBytes: 0
        }
    ]);
});

test('eliminationCompleted omits eliminatedSourceFiles when no files were eliminated', () => {
    const broadcaster = createProgressBroadcaster();
    const aggregator = createReportAggregator(broadcaster.consumer);

    broadcaster.provider.emit('eliminationCompleted', {
        perBundle: [
            {
                packageName: 'pkg-a',
                files: [{ path: '/src/index.js', decision: 'kept', reason: 'reachable', sourceBytes: 30 }],
                droppedSymbols: [],
                seeds: []
            }
        ]
    });

    assert.strictEqual('eliminatedSourceFiles' in (aggregator.build().packages['pkg-a'] ?? {}), false);
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
