import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { ArtifactEntry } from '../../progress/progress-broadcaster.ts';
import { mergeArtifactEntry } from './artifact-entry-merger.ts';

const baseEntry: ArtifactEntry = {
    path: 'src/index.js',
    sizeBytes: 10,
    kind: 'source',
    sourcePath: '/workspace/src/index.js',
    status: 'unchanged',
    badges: []
};

suite('artifact-entry-merger', function () {
    test('mergeArtifactEntry returns the entry unchanged when it has no sourcePath', function () {
        const entry: ArtifactEntry = { ...baseEntry, sourcePath: undefined };
        assert.strictEqual(mergeArtifactEntry(entry, new Set([ 'anything' ]), new Set([ 'anything' ])), entry);
    });

    test('mergeArtifactEntry adds the import-path-rewrite badge and "changed" status for rewritten files', function () {
        const merged = mergeArtifactEntry(baseEntry, new Set([ '/workspace/src/index.js' ]), new Set());

        assert.partialDeepStrictEqual(merged, {
            status: 'changed',
            badges: [ 'import-path-rewrite' ]
        });
    });

    test('mergeArtifactEntry adds the dead-code-elimination badge and "changed" status for transformed files', function () {
        const merged = mergeArtifactEntry(baseEntry, new Set(), new Set([ '/workspace/src/index.js' ]));

        assert.partialDeepStrictEqual(merged, {
            status: 'changed',
            badges: [ 'dead-code-elimination' ]
        });
    });

    test('mergeArtifactEntry combines both badges when both rewrite and transform apply', function () {
        const merged = mergeArtifactEntry(
            baseEntry,
            new Set([ '/workspace/src/index.js' ]),
            new Set([ '/workspace/src/index.js' ])
        );

        assert.strictEqual(merged.status, 'changed');
        assert.deepStrictEqual(
            merged.badges.toSorted(function (left, right) {
                return left.localeCompare(right);
            }),
            [ 'dead-code-elimination', 'import-path-rewrite' ]
        );
    });

    test('mergeArtifactEntry deduplicates badges that already appeared on the entry', function () {
        const merged = mergeArtifactEntry(
            { ...baseEntry, badges: [ 'import-path-rewrite' ] },
            new Set([ '/workspace/src/index.js' ]),
            new Set()
        );

        assert.deepStrictEqual(merged.badges, [ 'import-path-rewrite' ]);
    });
});
