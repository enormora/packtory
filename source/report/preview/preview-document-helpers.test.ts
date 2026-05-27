import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PackageReport } from '../aggregator/report-types.ts';
import type { PreviewArtifact } from './artifact-tree-builder.ts';
import { buildVersionTransition, hasMeaningfulChanges } from './preview-document-state.ts';

function reportWithVersion(version: NonNullable<PackageReport['decisions']['version']>): PackageReport {
    return { decisions: { version }, timings: {} };
}

function artifact(overrides: Partial<PreviewArtifact> = {}): PreviewArtifact {
    return {
        path: 'a.js',
        sizeBytes: 0,
        kind: 'source',
        sourcePath: '/src/a.js',
        status: 'unchanged',
        badges: [],
        ...overrides
    };
}

suite('preview-document-helpers', function () {
    test('buildVersionTransition returns undefined when the report has no version decision', function () {
        assert.strictEqual(buildVersionTransition({ decisions: {}, timings: {} }), undefined);
    });

    test('buildVersionTransition returns the chosen version when no previous version exists', function () {
        assert.strictEqual(
            buildVersionTransition(
                reportWithVersion({ chosenVersion: '1.0.0', previousVersion: undefined, trigger: 'initial' })
            ),
            '1.0.0'
        );
    });

    test('buildVersionTransition returns "previous -> chosen" when both versions exist', function () {
        assert.strictEqual(
            buildVersionTransition(
                reportWithVersion({ chosenVersion: '1.0.1', previousVersion: '1.0.0', trigger: 'auto-patch-bump' })
            ),
            '1.0.0 -> 1.0.1'
        );
    });

    test('hasMeaningfulChanges returns true when any eliminated source files are present', function () {
        assert.strictEqual(
            hasMeaningfulChanges([], [{ path: '/src/dead.js', sourceBytes: 1, reason: 'no-uses' }]),
            true
        );
    });

    test('hasMeaningfulChanges returns true when any artifact has the changed status', function () {
        assert.strictEqual(hasMeaningfulChanges([artifact({ status: 'changed' })], []), true);
    });

    test('hasMeaningfulChanges returns false when no artifact is changed and no source file was eliminated', function () {
        assert.strictEqual(hasMeaningfulChanges([artifact({ status: 'unchanged' })], []), false);
    });
});
