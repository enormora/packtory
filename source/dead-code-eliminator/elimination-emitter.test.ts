import assert from 'node:assert';
import { test } from 'mocha';
import { createProgressBroadcaster } from '../progress/progress-broadcaster.ts';
import { linkedBundle } from '../test-libraries/bundle-fixtures.ts';
import { createSpyingBroadcaster } from '../test-libraries/result-helpers.ts';
import type { AnalyzedBundle, AnalyzedBundleResource } from './analyzed-bundle.ts';
import { maybeEmitElimination } from './elimination-emitter.ts';

function resource(sourceFilePath: string, content: string): AnalyzedBundleResource {
    return {
        fileDescription: { content, isExecutable: false, sourceFilePath, targetFilePath: sourceFilePath.slice(1) },
        directDependencies: new Set<string>(),
        isSubstituted: false,
        isExplicitlyIncluded: false,
        analysis: {
            survivingBindings: new Set<string>(),
            sideEffectStatements: [],
            sideEffectImports: new Set<string>()
        }
    };
}

function bundle(name: string, resources: readonly AnalyzedBundleResource[]): AnalyzedBundle {
    return {
        name,
        contents: resources,
        entryPoints: [],
        linkedBundleDependencies: { dependencies: {}, peerDependencies: {} },
        externalDependencies: { dependencies: {}, peerDependencies: {} },
        sideEffectsField: undefined
    } as unknown as AnalyzedBundle;
}

function originalBundle(name: string, resources: readonly AnalyzedBundleResource[]) {
    return linkedBundle({
        name,
        contents: resources.map((resource) => {
            return {
                fileDescription: resource.fileDescription,
                directDependencies: resource.directDependencies,
                isExplicitlyIncluded: resource.isExplicitlyIncluded,
                isSubstituted: resource.isSubstituted
            };
        })
    });
}

test('maybeEmitElimination() does not emit when no subscriber is registered', () => {
    const wrapped = createSpyingBroadcaster();

    maybeEmitElimination(wrapped.provider, [originalBundle('pkg-a', [resource('/src/a.ts', 'abc')])], [
        bundle('pkg-a', [resource('/src/a.ts', 'abc')])
    ]);

    assert.strictEqual(wrapped.emitSpy.callCount, 0);
});

test('maybeEmitElimination() emits eliminationCompleted with per-bundle decisions when a subscriber is registered', () => {
    const broadcaster = createProgressBroadcaster();
    const received: { perBundle: { packageName: string; files: { path: string; sourceBytes: number }[] }[] }[] = [];
    broadcaster.consumer.on('eliminationCompleted', (payload) => {
        received.push({
            perBundle: payload.perBundle.map((bundleResult) => {
                return {
                    packageName: bundleResult.packageName,
                    files: bundleResult.files.map((file) => {
                        return { path: file.path, sourceBytes: file.sourceBytes };
                    })
                };
            })
        });
    });

    maybeEmitElimination(
        broadcaster.provider,
        [
            originalBundle('pkg-a', [resource('/src/a.ts', 'abcde'), resource('/src/b.ts', 'xy')]),
            originalBundle('pkg-b', [resource('/src/c.ts', 'hi')])
        ],
        [bundle('pkg-a', [resource('/src/a.ts', 'abcde'), resource('/src/b.ts', 'xy')]), bundle('pkg-b', [resource('/src/c.ts', 'hi')])]
    );

    assert.deepStrictEqual(received, [
        {
            perBundle: [
                {
                    packageName: 'pkg-a',
                    files: [
                        { path: '/src/a.ts', sourceBytes: 5 },
                        { path: '/src/b.ts', sourceBytes: 2 }
                    ]
                },
                {
                    packageName: 'pkg-b',
                    files: [{ path: '/src/c.ts', sourceBytes: 2 }]
                }
            ]
        }
    ]);
});

test('maybeEmitElimination() emits each file with decision "kept" and reason "reachable"', () => {
    const broadcaster = createProgressBroadcaster();
    const received: { decision: string; reason: string }[] = [];
    broadcaster.consumer.on('eliminationCompleted', (payload) => {
        for (const bundleResult of payload.perBundle) {
            for (const file of bundleResult.files) {
                received.push({ decision: file.decision, reason: file.reason });
            }
        }
    });

    maybeEmitElimination(
        broadcaster.provider,
        [originalBundle('pkg-a', [resource('/src/a.ts', 'x')])],
        [bundle('pkg-a', [resource('/src/a.ts', 'x')])]
    );

    assert.deepStrictEqual(received, [{ decision: 'kept', reason: 'reachable' }]);
});

test('maybeEmitElimination() emits empty droppedSymbols and seeds arrays per bundle', () => {
    const broadcaster = createProgressBroadcaster();
    const received: { droppedSymbols: unknown[]; seeds: unknown[] }[] = [];
    broadcaster.consumer.on('eliminationCompleted', (payload) => {
        for (const bundleResult of payload.perBundle) {
            received.push({
                droppedSymbols: Array.from(bundleResult.droppedSymbols),
                seeds: Array.from(bundleResult.seeds)
            });
        }
    });

    maybeEmitElimination(
        broadcaster.provider,
        [originalBundle('pkg-a', [resource('/src/a.ts', 'x')])],
        [bundle('pkg-a', [resource('/src/a.ts', 'x')])]
    );

    assert.deepStrictEqual(received, [{ droppedSymbols: [], seeds: [] }]);
});

test('maybeEmitElimination() emits an empty perBundle array when given no bundles and a subscriber is registered', () => {
    const broadcaster = createProgressBroadcaster();
    const received: { perBundle: unknown[] }[] = [];
    broadcaster.consumer.on('eliminationCompleted', (payload) => {
        received.push({ perBundle: Array.from(payload.perBundle) });
    });

    maybeEmitElimination(broadcaster.provider, [], []);

    assert.deepStrictEqual(received, [{ perBundle: [] }]);
});

test('maybeEmitElimination() marks a file as transformed when the analyzed output changed its content', () => {
    const broadcaster = createProgressBroadcaster();
    const received: { decision: string; outputBytes?: number }[] = [];
    broadcaster.consumer.on('eliminationCompleted', (payload) => {
        for (const bundleResult of payload.perBundle) {
            for (const file of bundleResult.files) {
                received.push({ decision: file.decision, outputBytes: file.outputBytes });
            }
        }
    });

    maybeEmitElimination(
        broadcaster.provider,
        [originalBundle('pkg-a', [resource('/src/a.ts', 'const unused = 1;\n')])],
        [bundle('pkg-a', [resource('/src/a.ts', 'const kept = 1;\n')])]
    );

    assert.deepStrictEqual(received, [{ decision: 'transformed', outputBytes: 16 }]);
});

test('maybeEmitElimination() marks a missing analyzed file as eliminated', () => {
    const broadcaster = createProgressBroadcaster();
    const received: { decision: string; path: string }[] = [];
    broadcaster.consumer.on('eliminationCompleted', (payload) => {
        for (const bundleResult of payload.perBundle) {
            for (const file of bundleResult.files) {
                received.push({ decision: file.decision, path: file.path });
            }
        }
    });

    maybeEmitElimination(
        broadcaster.provider,
        [originalBundle('pkg-a', [resource('/src/a.ts', 'const unused = 1;\n')])],
        [bundle('pkg-a', [])]
    );

    assert.deepStrictEqual(received, [{ decision: 'eliminated', path: '/src/a.ts' }]);
});
