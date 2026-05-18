import assert from 'node:assert';
import { test } from 'mocha';
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

test('isDiffableArtifact returns true for a changed source file with a source path and a code extension', () => {
    assert.strictEqual(isDiffableArtifact(diffable), true);
});

test('isDiffableArtifact returns false when the entry has no sourcePath', () => {
    assert.strictEqual(isDiffableArtifact({ ...diffable, sourcePath: undefined }), false);
});

test('isDiffableArtifact returns false when the entry status is not "changed"', () => {
    assert.strictEqual(isDiffableArtifact({ ...diffable, status: 'unchanged' }), false);
});

test('isDiffableArtifact returns false when the entry kind is not "source"', () => {
    assert.strictEqual(isDiffableArtifact({ ...diffable, kind: 'manifest' }), false);
});

test('isDiffableArtifact returns false for a non-code file extension', () => {
    assert.strictEqual(isDiffableArtifact({ ...diffable, path: 'README.md' }), false);
});

test('toDiffLineType returns "add" for lines starting with +', () => {
    assert.strictEqual(toDiffLineType('+new'), 'add');
});

test('toDiffLineType returns "remove" for lines starting with -', () => {
    assert.strictEqual(toDiffLineType('-gone'), 'remove');
});

test('toDiffLineType returns "context" for lines starting with anything else', () => {
    assert.strictEqual(toDiffLineType(' same'), 'context');
    assert.strictEqual(toDiffLineType('@@ hunk'), 'context');
});
