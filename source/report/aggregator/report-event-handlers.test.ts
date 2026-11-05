import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDeepSubset } from '../../test-libraries/deep-subset-assertion.ts';
import { stagedForApproval } from '../../bundle-emitter/publication-outcome.ts';
import { createReportEventHandlers, type AggregatorState } from './report-event-handlers.ts';
import type { PackageReport } from './report-types.ts';

type EliminationFileInput = {
    readonly path: string;
    readonly decision: 'eliminated' | 'kept' | 'transformed';
    readonly reason: string;
    readonly sourceBytes: number;
    readonly outputBytes?: number;
};

function freshState(): AggregatorState {
    return { packages: new Map() };
}

function emitEliminationForPackageA(files: readonly EliminationFileInput[]): AggregatorState {
    const state = freshState();
    const broadcaster = { provider: createReportEventHandlers(state) };

    broadcaster.provider.emit('eliminationCompleted', {
        perBundle: [ { packageName: 'package-a', files, droppedSymbols: [], seeds: [] } ]
    });
    return state;
}

function expectPackageEntry(state: AggregatorState, packageName: string): PackageReport {
    const entry = state.packages.get(packageName);
    if (entry === undefined) {
        assert.fail(`expected ${packageName} in report`);
    }
    return entry;
}

function registerPackageEventTests(): void {
    test('createReportEventHandlers records inputs when an inputsResolved event arrives', function () {
        const state = freshState();
        const broadcaster = { provider: createReportEventHandlers(state) };

        broadcaster.provider.emit('inputsResolved', {
            packageName: 'package-a',
            roots: { main: 'source/index.js' },
            siblingVersions: { 'package-b': '1.0.0' },
            sourceFileCount: 3
        });

        const entry = expectPackageEntry(state, 'package-a');
        assertDeepSubset(entry, {
            inputs: {
                roots: { main: 'source/index.js' },
                siblingVersions: { 'package-b': '1.0.0' },
                sourceFileCount: 3
            }
        });
    });

    test('createReportEventHandlers records the assembled package.json fields on the package entry', function () {
        const state = freshState();
        const broadcaster = { provider: createReportEventHandlers(state) };

        broadcaster.provider.emit('packageManifestAssembled', {
            packageName: 'package-a',
            fields: { name: { source: 'mainPackageManifest' }, version: { source: 'derived' } }
        });

        assert.deepStrictEqual(state.packages.get('package-a')?.decisions.packageManifest, {
            name: { source: 'mainPackageManifest' },
            version: { source: 'derived' }
        });
    });

    test('createReportEventHandlers records the effective config on the package entry', function () {
        const state = freshState();
        const broadcaster = { provider: createReportEventHandlers(state) };

        broadcaster.provider.emit('effectiveConfigurationResolved', {
            packageName: 'package-a',
            configuration: { feature: true }
        });

        assert.deepStrictEqual(state.packages.get('package-a')?.inputs?.effectiveConfiguration, { feature: true });
    });

    test('createReportEventHandlers records the version decision on the package entry', function () {
        const state = freshState();
        const broadcaster = { provider: createReportEventHandlers(state) };

        broadcaster.provider.emit('versionDetermined', {
            packageName: 'package-a',
            previousVersion: '1.0.0',
            chosenVersion: '1.0.1',
            trigger: 'auto-patch-bump'
        });

        assert.deepStrictEqual(state.packages.get('package-a')?.decisions.version, {
            previousVersion: '1.0.0',
            chosenVersion: '1.0.1',
            trigger: 'auto-patch-bump'
        });
    });

    test('createReportEventHandlers records linker rewrites on the package entry', function () {
        const state = freshState();
        const broadcaster = { provider: createReportEventHandlers(state) };

        broadcaster.provider.emit('linkingCompleted', {
            packageName: 'package-a',
            rewrites: [ { file: 'a.js', fromSpecifier: 'old', toSpecifier: 'new', targetBundle: 'package-b' } ]
        });

        assert.deepStrictEqual(state.packages.get('package-a')?.decisions.linker, {
            rewrites: [ { file: 'a.js', fromSpecifier: 'old', toSpecifier: 'new', targetBundle: 'package-b' } ]
        });
    });

    test('createReportEventHandlers stores stageTimed entries in the timings record', function () {
        const state = freshState();
        const broadcaster = { provider: createReportEventHandlers(state) };

        broadcaster.provider.emit('stageTimed', { packageName: 'package-a', stage: 'build', durationMilliseconds: 42 });

        assert.strictEqual(state.packages.get('package-a')?.timings.build, 42);
    });

    test('createReportEventHandlers records publication outcomes from done events', function () {
        const state = freshState();
        const broadcaster = { provider: createReportEventHandlers(state) };

        broadcaster.provider.emit('done', {
            packageName: 'package-a',
            version: '1.2.3',
            status: 'new-version',
            publication: stagedForApproval('stage-123')
        });

        assert.deepStrictEqual(state.packages.get('package-a')?.publication, stagedForApproval('stage-123'));
    });

    test('createReportEventHandlers records package failures', function () {
        const state = freshState();
        const broadcaster = { provider: createReportEventHandlers(state) };

        broadcaster.provider.emit('packageFailed', { packageName: 'package-a', stage: 'publish', message: 'boom' });

        assert.deepStrictEqual(state.packages.get('package-a')?.failure, { stage: 'publish', message: 'boom' });
    });

    test('createReportEventHandlers aggregates artifact size and entries on artifactsCollected', function () {
        const state = freshState();
        const broadcaster = { provider: createReportEventHandlers(state) };

        broadcaster.provider.emit('artifactsCollected', {
            packageName: 'package-a',
            entries: [
                {
                    path: 'a.js',
                    sizeBytes: 10,
                    kind: 'source',
                    sourcePath: '/source/a.js',
                    status: 'generated',
                    badges: []
                },
                {
                    path: 'b.js',
                    sizeBytes: 20,
                    kind: 'source',
                    sourcePath: '/source/b.js',
                    status: 'generated',
                    badges: []
                }
            ]
        });

        assert.strictEqual(state.packages.get('package-a')?.outputs?.tarball.totalBytes, 30);
        assert.strictEqual(state.packages.get('package-a')?.outputs?.tarball.entries.length, 2);
    });

    test('createReportEventHandlers records scanCompleted entries under decisions.dependencyScan', function () {
        const state = freshState();
        const broadcaster = { provider: createReportEventHandlers(state) };

        broadcaster.provider.emit('scanCompleted', {
            packageName: 'package-a',
            included: [ { path: '/source/a.ts', reason: 'reachable-from-entry' } ],
            excluded: [ { specifier: 'lodash', reason: 'external-module' } ]
        });

        assert.deepStrictEqual(state.packages.get('package-a')?.decisions.dependencyScan, {
            included: [ { path: '/source/a.ts', reason: 'reachable-from-entry' } ],
            excluded: [ { specifier: 'lodash', reason: 'external-module' } ]
        });
    });
}

function registerEliminationTests(): void {
    test('createReportEventHandlers omits eliminatedSourceFiles when no files were eliminated', function () {
        const state = emitEliminationForPackageA([
            { path: '/source/a.js', decision: 'kept', reason: 'reachable', sourceBytes: 1 }
        ]);

        const entry = expectPackageEntry(state, 'package-a');
        assert.strictEqual(Object.hasOwn(entry, 'eliminatedSourceFiles'), false);
    });

    test('createReportEventHandlers preserves outputBytes on eliminated files when it is provided', function () {
        const state = emitEliminationForPackageA([
            {
                path: '/source/a.js',
                decision: 'eliminated',
                reason: 'not-emitted-after-analysis',
                sourceBytes: 5,
                outputBytes: 1
            }
        ]);

        assert.deepStrictEqual(state.packages.get('package-a')?.eliminatedSourceFiles, [
            { path: '/source/a.js', reason: 'not-emitted-after-analysis', sourceBytes: 5, outputBytes: 1 }
        ]);
    });

    test('createReportEventHandlers separates eliminated source files from kept files when elimination completes', function () {
        const state = emitEliminationForPackageA([
            { path: 'a.js', decision: 'kept', reason: 'kept', sourceBytes: 10 },
            { path: 'b.js', decision: 'eliminated', reason: 'no-uses', sourceBytes: 5 }
        ]);

        const entry = expectPackageEntry(state, 'package-a');
        const { decisions: { deadCodeElimination }, eliminatedSourceFiles } = entry;
        if (deadCodeElimination === undefined || eliminatedSourceFiles === undefined) {
            assert.fail('expected dead-code-elimination report data');
        }
        assert.deepStrictEqual(
            {
                keptFileCount: deadCodeElimination.files.length,
                eliminatedSourceFiles,
                hasOutputBytes: Object.hasOwn(eliminatedSourceFiles[0] ?? {}, 'outputBytes')
            },
            {
                keptFileCount: 1,
                eliminatedSourceFiles: [ { path: 'b.js', sourceBytes: 5, reason: 'no-uses' } ],
                hasOutputBytes: false
            }
        );
    });
}

suite('report-event-handlers', function () {
    registerPackageEventTests();
    registerEliminationTests();
});
