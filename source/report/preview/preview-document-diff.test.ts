import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { ArtifactEntry } from '../../progress/progress-broadcaster.ts';
import { isDiffableArtifact, toDiffLineType } from './preview-document-diff.ts';

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

    test('toDiffLineType returns "add" for lines starting with +', function () {
        assert.strictEqual(toDiffLineType('+new'), 'add');
    });

    test('toDiffLineType returns "remove" for lines starting with -', function () {
        assert.strictEqual(toDiffLineType('-gone'), 'remove');
    });

    test('toDiffLineType returns "context" for lines starting with anything else', function () {
        assert.strictEqual(toDiffLineType(' same'), 'context');
        assert.strictEqual(toDiffLineType('@@ hunk'), 'context');
    });
});
