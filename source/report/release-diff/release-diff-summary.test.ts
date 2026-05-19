import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { FileSetDiff, PackageReleaseDiffStateView } from './file-set-diff.ts';
import { summarizeReleaseDiff } from './release-diff-summary.ts';

const emptyFiles: FileSetDiff = { added: [], removed: [], modified: [], unchanged: [] };

function stateView(overrides: Partial<PackageReleaseDiffStateView>): PackageReleaseDiffStateView {
    return { state: 'changed', files: emptyFiles, ...overrides };
}

function addedFile(path: string): FileSetDiff['added'][number] {
    return { path, sizeBytes: 0, isExecutable: false };
}

suite('release-diff-summary', function () {
    test('counts zero failed packages when none are reported', function () {
        const summary = summarizeReleaseDiff([], 0);
        assert.strictEqual(summary.totalPackages, 0);
        assert.strictEqual(summary.failedPackages, 0);
    });

    test('classifies package states into changed, first-publish, and unchanged buckets', function () {
        const summary = summarizeReleaseDiff(
            [
                stateView({ state: 'changed' }),
                stateView({ state: 'first-publish' }),
                stateView({ state: 'unchanged' }),
                stateView({ state: 'changed' })
            ],
            0
        );
        assert.strictEqual(summary.changedPackages, 2);
        assert.strictEqual(summary.firstPublishPackages, 1);
        assert.strictEqual(summary.unchangedPackages, 1);
        assert.strictEqual(summary.totalPackages, 4);
    });

    test('includes the failed package count in total but not in any other state bucket', function () {
        const summary = summarizeReleaseDiff([stateView({ state: 'changed' })], 2);
        assert.strictEqual(summary.totalPackages, 3);
        assert.strictEqual(summary.failedPackages, 2);
        assert.strictEqual(summary.changedPackages, 1);
    });

    test('aggregates file counts across all packages', function () {
        const summary = summarizeReleaseDiff(
            [
                stateView({
                    files: {
                        added: [addedFile('a'), addedFile('b')],
                        removed: [addedFile('c')],
                        modified: [],
                        unchanged: []
                    }
                }),
                stateView({
                    files: {
                        added: [addedFile('d')],
                        removed: [],
                        modified: [
                            {
                                path: 'e',
                                oldSizeBytes: 0,
                                newSizeBytes: 1,
                                oldIsExecutable: false,
                                newIsExecutable: false,
                                contentChange: { kind: 'binary' }
                            }
                        ],
                        unchanged: []
                    }
                })
            ],
            0
        );
        assert.strictEqual(summary.addedFiles, 3);
        assert.strictEqual(summary.removedFiles, 1);
        assert.strictEqual(summary.modifiedFiles, 1);
    });
});
