import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createPreviewPackageFixture } from '../../test-libraries/preview-fixtures.ts';
import { summarizePackages } from './preview-summary.ts';

suite('preview-summary', function () {
    test('summarizePackages returns zero counts for an empty package list', function () {
        assert.deepStrictEqual(summarizePackages([]), {
            totalPackages: 0,
            changedPackages: 0,
            unchangedPackages: 0,
            failedPackages: 0,
            emittedArtifacts: 0,
            changedArtifacts: 0,
            eliminatedSourceFiles: 0
        });
    });

    test('summarizePackages counts a package as changed when it has changes', function () {
        const summary = summarizePackages([
            createPreviewPackageFixture({
                hasChanges: true,
                eliminatedSourceFiles: [],
                artifactCounts: { emitted: 1, changed: 1 }
            })
        ]);
        assert.partialDeepStrictEqual(summary, {
            changedPackages: 1,
            unchangedPackages: 0
        });
    });

    test('summarizePackages counts an unchanged success as an unchanged package', function () {
        const summary = summarizePackages([
            createPreviewPackageFixture({
                hasChanges: false,
                eliminatedSourceFiles: [],
                artifactCounts: { emitted: 0, changed: 0 }
            })
        ]);
        assert.partialDeepStrictEqual(summary, {
            unchangedPackages: 1,
            changedPackages: 0
        });
    });

    test('summarizePackages counts a package as failed when it has a failure entry', function () {
        const summary = summarizePackages([
            createPreviewPackageFixture({
                hasChanges: false,
                failure: { stage: 'publish', message: 'boom' },
                eliminatedSourceFiles: [],
                artifactCounts: { emitted: 0, changed: 0 }
            })
        ]);
        assert.strictEqual(summary.failedPackages, 1);
    });

    test('summarizePackages sums emitted and changed artifacts across packages and ignores directories', function () {
        const summary = summarizePackages([
            createPreviewPackageFixture({
                hasChanges: true,
                eliminatedSourceFiles: [ { path: '/a.js', reason: 'unused', sourceBytes: 1 } ],
                artifactCounts: { emitted: 2, changed: 1 }
            })
        ]);
        assert.partialDeepStrictEqual(summary, {
            emittedArtifacts: 2,
            changedArtifacts: 1,
            eliminatedSourceFiles: 1
        });
    });
});
