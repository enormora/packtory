import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDeepSubset } from '../../test-libraries/deep-subset-assertion.ts';
import { stagedForApproval } from '../../bundle-emitter/publication-outcome.ts';
import { createProgressBroadcaster } from '../../progress/progress-broadcaster.ts';
import { registerSubscribers, type AggregatorState } from './report-event-handlers.ts';
import type { MutablePackageReport } from './report-types.ts';

type EliminationFileInput = {
    readonly path: string;
    readonly decision: 'eliminated' | 'kept' | 'transformed';
    readonly reason: string;
    readonly sourceBytes: number;
    readonly outputBytes?: number;
};

function freshState(): AggregatorState {
    const disposers: (() => void)[] = [];
    return { packages: new Map(), disposers };
}

function emitEliminationForPkgA(files: readonly EliminationFileInput[]): AggregatorState {
    const state = freshState();
    const broadcaster = createProgressBroadcaster();
    registerSubscribers(state, broadcaster.consumer);

    broadcaster.provider.emit('eliminationCompleted', {
        perBundle: [ { packageName: 'pkg-a', files, droppedSymbols: [], seeds: [] } ]
    });
    return state;
}

function expectPackageEntry(state: AggregatorState, packageName: string): MutablePackageReport {
    const entry = state.packages.get(packageName);
    if (entry === undefined) {
        assert.fail(`expected ${packageName} in report`);
    }
    return entry;
}

function registerPackageEventTests(): void {
    test('registerSubscribers records inputs when an inputsResolved event arrives', function () {
        const state = freshState();
        const broadcaster = createProgressBroadcaster();
        registerSubscribers(state, broadcaster.consumer);

        broadcaster.provider.emit('inputsResolved', {
            packageName: 'pkg-a',
            roots: { main: 'src/index.js' },
            siblingVersions: { 'pkg-b': '1.0.0' },
            sourceFileCount: 3
        });

        const entry = expectPackageEntry(state, 'pkg-a');
        assertDeepSubset(entry, {
            roots: { main: 'src/index.js' },
            siblingVersions: { 'pkg-b': '1.0.0' },
            sourceFileCount: 3
        });
    });

    test('registerSubscribers records the assembled package.json fields on the package entry', function () {
        const state = freshState();
        const broadcaster = createProgressBroadcaster();
        registerSubscribers(state, broadcaster.consumer);

        broadcaster.provider.emit('packageJsonAssembled', {
            packageName: 'pkg-a',
            fields: { name: { source: 'mainPackageJson' }, version: { source: 'derived' } }
        });

        assert.deepStrictEqual(state.packages.get('pkg-a')?.decisions.packageJson, {
            name: { source: 'mainPackageJson' },
            version: { source: 'derived' }
        });
    });

    test('registerSubscribers records the effective config on the package entry', function () {
        const state = freshState();
        const broadcaster = createProgressBroadcaster();
        registerSubscribers(state, broadcaster.consumer);

        broadcaster.provider.emit('effectiveConfigResolved', { packageName: 'pkg-a', config: { feature: true } });

        assert.deepStrictEqual(state.packages.get('pkg-a')?.effectiveConfig, { feature: true });
    });

    test('registerSubscribers records the version decision on the package entry', function () {
        const state = freshState();
        const broadcaster = createProgressBroadcaster();
        registerSubscribers(state, broadcaster.consumer);

        broadcaster.provider.emit('versionDetermined', {
            packageName: 'pkg-a',
            previousVersion: '1.0.0',
            chosenVersion: '1.0.1',
            trigger: 'auto-patch-bump'
        });

        assert.deepStrictEqual(state.packages.get('pkg-a')?.decisions.version, {
            previousVersion: '1.0.0',
            chosenVersion: '1.0.1',
            trigger: 'auto-patch-bump'
        });
    });

    test('registerSubscribers records linker rewrites on the package entry', function () {
        const state = freshState();
        const broadcaster = createProgressBroadcaster();
        registerSubscribers(state, broadcaster.consumer);

        broadcaster.provider.emit('linkingCompleted', {
            packageName: 'pkg-a',
            rewrites: [ { file: 'a.js', fromSpecifier: 'old', toSpecifier: 'new', targetBundle: 'pkg-b' } ]
        });

        assert.deepStrictEqual(state.packages.get('pkg-a')?.decisions.linker, {
            rewrites: [ { file: 'a.js', fromSpecifier: 'old', toSpecifier: 'new', targetBundle: 'pkg-b' } ]
        });
    });

    test('registerSubscribers stores stageTimed entries in the timings record', function () {
        const state = freshState();
        const broadcaster = createProgressBroadcaster();
        registerSubscribers(state, broadcaster.consumer);

        broadcaster.provider.emit('stageTimed', { packageName: 'pkg-a', stage: 'build', durationMs: 42 });

        assert.strictEqual(state.packages.get('pkg-a')?.timings.build, 42);
    });

    test('registerSubscribers records publication outcomes from done events', function () {
        const state = freshState();
        const broadcaster = createProgressBroadcaster();
        registerSubscribers(state, broadcaster.consumer);

        broadcaster.provider.emit('done', {
            packageName: 'pkg-a',
            version: '1.2.3',
            status: 'new-version',
            publication: stagedForApproval('stage-123')
        });

        assert.deepStrictEqual(state.packages.get('pkg-a')?.publication, stagedForApproval('stage-123'));
    });

    test('registerSubscribers records package failures', function () {
        const state = freshState();
        const broadcaster = createProgressBroadcaster();
        registerSubscribers(state, broadcaster.consumer);

        broadcaster.provider.emit('packageFailed', { packageName: 'pkg-a', stage: 'publish', message: 'boom' });

        assert.deepStrictEqual(state.packages.get('pkg-a')?.failure, { stage: 'publish', message: 'boom' });
    });

    test('registerSubscribers aggregates artifact size and entries on artifactsCollected', function () {
        const state = freshState();
        const broadcaster = createProgressBroadcaster();
        registerSubscribers(state, broadcaster.consumer);

        broadcaster.provider.emit('artifactsCollected', {
            packageName: 'pkg-a',
            entries: [
                {
                    path: 'a.js',
                    sizeBytes: 10,
                    kind: 'source',
                    sourcePath: '/src/a.js',
                    status: 'generated',
                    badges: []
                },
                {
                    path: 'b.js',
                    sizeBytes: 20,
                    kind: 'source',
                    sourcePath: '/src/b.js',
                    status: 'generated',
                    badges: []
                }
            ]
        });

        assert.strictEqual(state.packages.get('pkg-a')?.outputs?.tarball.totalBytes, 30);
        assert.strictEqual(state.packages.get('pkg-a')?.outputs?.tarball.entries.length, 2);
    });

    test('registerSubscribers records scanCompleted entries under decisions.dependencyScan', function () {
        const state = freshState();
        const broadcaster = createProgressBroadcaster();
        registerSubscribers(state, broadcaster.consumer);

        broadcaster.provider.emit('scanCompleted', {
            packageName: 'pkg-a',
            included: [ { path: '/src/a.ts', reason: 'reachable-from-entry' } ],
            excluded: [ { specifier: 'lodash', reason: 'external-module' } ]
        });

        assert.deepStrictEqual(state.packages.get('pkg-a')?.decisions.dependencyScan, {
            included: [ { path: '/src/a.ts', reason: 'reachable-from-entry' } ],
            excluded: [ { specifier: 'lodash', reason: 'external-module' } ]
        });
    });
}

function registerEliminationTests(): void {
    test('registerSubscribers omits eliminatedSourceFiles when no files were eliminated', function () {
        const state = emitEliminationForPkgA([
            { path: '/src/a.js', decision: 'kept', reason: 'reachable', sourceBytes: 1 }
        ]);

        const entry = expectPackageEntry(state, 'pkg-a');
        assert.strictEqual(Object.hasOwn(entry, 'eliminatedSourceFiles'), false);
    });

    test('registerSubscribers preserves outputBytes on eliminated files when it is provided', function () {
        const state = emitEliminationForPkgA([
            {
                path: '/src/a.js',
                decision: 'eliminated',
                reason: 'not-emitted-after-analysis',
                sourceBytes: 5,
                outputBytes: 1
            }
        ]);

        assert.deepStrictEqual(state.packages.get('pkg-a')?.eliminatedSourceFiles, [
            { path: '/src/a.js', reason: 'not-emitted-after-analysis', sourceBytes: 5, outputBytes: 1 }
        ]);
    });

    test('registerSubscribers separates eliminated source files from kept files when elimination completes', function () {
        const state = emitEliminationForPkgA([
            { path: 'a.js', decision: 'kept', reason: 'kept', sourceBytes: 10 },
            { path: 'b.js', decision: 'eliminated', reason: 'no-uses', sourceBytes: 5 }
        ]);

        const entry = expectPackageEntry(state, 'pkg-a');
        assertDeepSubset(entry, {
            decisions: {
                deadCodeElimination: {
                    files: {
                        length: 1
                    }
                }
            },
            eliminatedSourceFiles: [ { path: 'b.js', sourceBytes: 5, reason: 'no-uses' } ]
        });
    });
}

function registerDisposerTests(): void {
    test('registerSubscribers exposes disposers that unsubscribe registered handlers', function () {
        const state = freshState();
        const broadcaster = createProgressBroadcaster();
        registerSubscribers(state, broadcaster.consumer);

        for (const dispose of state.disposers) {
            dispose();
        }

        broadcaster.provider.emit('inputsResolved', {
            packageName: 'pkg-a',
            roots: { main: 'src/index.js' },
            siblingVersions: {},
            sourceFileCount: 0
        });

        assert.strictEqual(state.packages.has('pkg-a'), false);
    });
}

suite('report-event-handlers', function () {
    registerPackageEventTests();
    registerEliminationTests();
    registerDisposerTests();
});
