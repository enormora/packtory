import assert from 'node:assert';
import { test } from 'mocha';
import { createPreviewPackageFixture } from '../test-libraries/preview-fixtures.ts';
import { collectChangedArtifacts } from './changed-artifacts.ts';

test('collectChangedArtifacts ignores file nodes without artifact payloads', () => {
    assert.deepStrictEqual(
        collectChangedArtifacts(
            createPreviewPackageFixture({
                tree: [
                    { path: 'broken.js', name: 'broken.js', depth: 0, type: 'file' },
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
                    }
                ]
            }).tree
        ).map((artifact) => artifact.path),
        ['ok.js']
    );
});
