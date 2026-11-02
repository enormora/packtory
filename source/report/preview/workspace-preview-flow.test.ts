import assert from 'node:assert';
import { suite, test } from 'mocha';
import { inspectWorkspace } from '../../test-libraries/workspace-inspector.ts';
import { createProgressBroadcaster } from '../../progress/progress-broadcaster.ts';
import { createReportAggregator } from '../aggregator/report-aggregator.ts';
import { reportResolvedBundle } from '../resolution-reporting.ts';
import { bundleResource, analyzedBundle } from '../../test-libraries/bundle-fixtures.ts';
import { createVersionManager } from '../../version-manager/manager.ts';
import type { BuildVersionedBundleOptions } from '../../version-manager/versioned-bundle.ts';
import { buildWorkspaceComparison, type WorkspaceComparison } from './workspace-comparison.ts';

function buildOptions(): BuildVersionedBundleOptions {
    return {
        bundle: analyzedBundle({
            name: 'pkg',
            contents: [ {
                ...bundleResource('/source/index.js', { content: 'export const value = 1;' }),
                isSubstituted: false,
                analysis: {
                    survivingBindings: new Set<string>(),
                    sideEffectStatements: [],
                    sideEffectImports: new Set<string>()
                }
            } ]
        }),
        version: '1.0.0',
        mainPackageManifest: { type: 'module', dependencies: { unused: '^1' } },
        bundleDependencies: [],
        bundlePeerDependencies: [],
        additionalPackageManifestAttributes: {},
        allowMutableSpecifiers: []
    };
}

function assertComparison(comparison: WorkspaceComparison): void {
    assert.strictEqual(
        comparison.sourceTree?.some(function (node) {
            return node.path === 'index.js';
        }),
        true
    );
    assert.strictEqual(
        comparison.comparisonRows?.some(function (row) {
            return row.label === 'dependencies: unused' && row.before === '^1' && row.after === 'absent';
        }),
        true
    );
}

suite('workspace preview flow', function () {
    test('captures build-time input and final dependency changes without altering package bytes', function () {
        const broadcaster = createProgressBroadcaster();
        const collector = createReportAggregator(broadcaster.consumer);
        const options = buildOptions();
        reportResolvedBundle(broadcaster.provider, options.bundle, options.mainPackageManifest, inspectWorkspace);
        const manager = createVersionManager({ inspectWorkspace, progressBroadcaster: broadcaster.provider });
        const withReport = manager.addVersion(options);
        assert.strictEqual(manager.increaseVersion(withReport).packageManifest.version, '1.0.1');
        collector.unsubscribe();
        assert.deepStrictEqual(manager.addVersion(options), withReport);
        assertComparison(
            buildWorkspaceComparison(collector.build().packages.pkg ?? assert.fail('expected package report'), [])
        );
    });
});
