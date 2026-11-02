import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProgressBroadcaster } from '../progress/progress-broadcaster.ts';
import { inspectWorkspace } from '../test-libraries/workspace-inspector.ts';
import { analyzedBundle, bundleResource, externalDependency } from '../test-libraries/bundle-fixtures.ts';
import { explicitPackageSurface } from '../package-surface/surface.ts';
import { createEmptyFileAnalysis } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { WorkspaceSnapshot } from '../report/inspectors/inspect-workspace.ts';
import { createVersionManager } from './manager.ts';
import type { BuildVersionedBundleOptions } from './versioned-bundle.ts';

function buildOptions(): BuildVersionedBundleOptions {
    const runtime = bundleResource('/source/cli.js', { content: '#!/usr/bin/env node\nexport const value = 1;' });
    return {
        bundle: analyzedBundle({
            name: 'pkg',
            roots: { main: { javaScript: runtime.fileDescription } },
            surface: explicitPackageSurface({
                modules: [ { root: 'main', export: '.' } ],
                executables: [ { root: 'main', name: 'tool' } ]
            }),
            contents: [ { ...runtime, isSubstituted: false, analysis: createEmptyFileAnalysis() } ],
            externalDependencies: new Map([ [ 'dep', externalDependency('dep') ], [
                'peer',
                externalDependency('peer')
            ] ])
        }),
        version: '1.0.0',
        mainPackageManifest: { type: 'module', dependencies: { dep: '^1' }, peerDependencies: { peer: '^2' } },
        bundleDependencies: [],
        bundlePeerDependencies: [],
        additionalPackageManifestAttributes: {},
        allowMutableSpecifiers: []
    };
}

suite('versioned workspace snapshots', function () {
    test('captures emitted dependency groups and executable mappings for selected and bumped versions', function () {
        const broadcaster = createProgressBroadcaster();
        const snapshots: WorkspaceSnapshot[] = [];
        broadcaster.consumer.on('packageCaptured', function (payload) {
            snapshots.push(payload.snapshot);
        });
        const manager = createVersionManager({ progressBroadcaster: broadcaster.provider, inspectWorkspace });
        manager.increaseVersion(manager.addVersion(buildOptions()));
        assert.strictEqual(snapshots.length, 2);
        assert.partialDeepStrictEqual(snapshots, [
            { dependencies: { dep: '^1' }, peerDependencies: { peer: '^2' }, executables: '{"tool":"./cli.js"}' },
            { dependencies: { dep: '^1' }, peerDependencies: { peer: '^2' }, executables: '{"tool":"./cli.js"}' }
        ]);
    });
});
