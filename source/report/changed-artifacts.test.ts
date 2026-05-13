import assert from 'node:assert';
import { test } from 'mocha';
import { createPreviewPackageFixture } from '../test-libraries/preview-fixtures.ts';
import { collectChangedArtifacts } from './changed-artifacts.ts';

test('collectChangedArtifacts ignores non-file nodes and unchanged files', () => {
    assert.deepStrictEqual(
        collectChangedArtifacts(
            createPreviewPackageFixture({
                tree: [
                    { path: 'src', name: 'src', depth: 0, type: 'directory' },
                    {
                        path: 'ok.js',
                        name: 'ok.js',
                        depth: 0,
                        type: 'file',
                        artifact: {
                            path: 'ok.js',
                            sizeBytes: 1,
                            kind: 'source',
                            status: 'changed',
                            badges: [],
                            diff: [{ header: '@@ -1,1 +1,1 @@', lines: [] }]
                        }
                    },
                    {
                        path: 'same.js',
                        name: 'same.js',
                        depth: 0,
                        type: 'file',
                        artifact: {
                            path: 'same.js',
                            sizeBytes: 1,
                            kind: 'source',
                            status: 'unchanged',
                            badges: []
                        }
                    }
                ]
            }).tree
        ).map((artifact) => artifact.path),
        ['ok.js']
    );
});
