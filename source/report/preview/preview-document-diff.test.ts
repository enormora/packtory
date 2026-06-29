import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { ArtifactEntry } from '../../progress/progress-broadcaster.ts';
import { isDiffableArtifact, toPreviewDiffHunk } from './preview-document-diff.ts';

const diffable: ArtifactEntry = {
    path: 'src/index.js',
    sizeBytes: 10,
    kind: 'source',
    sourcePath: '/workspace/src/index.js',
    status: 'changed',
    badges: []
};

suite('preview-document-diff', function () {
    test('isDiffableArtifact returns true for a changed source file with a source path and a code extension', function () {
        assert.strictEqual(isDiffableArtifact(diffable), true);
    });

    test('isDiffableArtifact returns false when the entry has no sourcePath', function () {
        assert.strictEqual(isDiffableArtifact({ ...diffable, sourcePath: undefined }), false);
    });

    test('isDiffableArtifact returns false when the entry status is not "changed"', function () {
        assert.strictEqual(isDiffableArtifact({ ...diffable, status: 'unchanged' }), false);
    });

    test('isDiffableArtifact returns false when the entry kind is not "source"', function () {
        assert.strictEqual(isDiffableArtifact({ ...diffable, kind: 'manifest' }), false);
    });

    test('isDiffableArtifact returns false for a non-code file extension', function () {
        assert.strictEqual(isDiffableArtifact({ ...diffable, path: 'README.md' }), false);
    });

    test('toPreviewDiffHunk classifies a "+" line as add, a "-" line as remove, and other lines as context', function () {
        const hunk = toPreviewDiffHunk({
            oldStart: 1,
            oldLines: 1,
            newStart: 1,
            newLines: 1,
            lines: [ '+inserted', '-removed', ' context line' ]
        });
        assert.deepStrictEqual(hunk.lines, [
            { type: 'add', text: '+inserted' },
            { type: 'remove', text: '-removed' },
            { type: 'context', text: ' context line' }
        ]);
    });

    test('toPreviewDiffHunk strips "\\ No newline at end of file" continuation markers from the hunk lines', function () {
        const hunk = toPreviewDiffHunk({
            oldStart: 1,
            oldLines: 1,
            newStart: 1,
            newLines: 1,
            lines: [ '+kept', '\\ No newline at end of file' ]
        });
        assert.deepStrictEqual(hunk.lines, [ { type: 'add', text: '+kept' } ]);
    });

    test('toPreviewDiffHunk renders the hunk header with the unified-diff line-range format', function () {
        const hunk = toPreviewDiffHunk({ oldStart: 3, oldLines: 5, newStart: 7, newLines: 11, lines: [] });
        assert.strictEqual(hunk.header, '@@ -3,5 +7,11 @@');
    });
});
