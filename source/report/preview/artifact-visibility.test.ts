import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createArtifactEntryFixture } from '../../test-libraries/preview-fixtures.ts';
import { buildArtifactTree } from './artifact-tree-builder.ts';
import { visibleArtifactTree, hiddenArtifactCount } from './artifact-visibility.ts';

suite('artifact visibility', function () {
    test('keeps ancestors of visible files and removes empty directories', function () {
        const tree = buildArtifactTree([
            createArtifactEntryFixture({ path: 'kept/deep/a.js', status: 'changed' }),
            createArtifactEntryFixture({ path: 'hidden/b.js', status: 'unchanged' }),
            createArtifactEntryFixture({ path: 'kept/unchanged.js', status: 'unchanged' }),
            createArtifactEntryFixture({ path: 'package.json', kind: 'manifest', status: 'generated' })
        ]);
        assert.deepStrictEqual(
            visibleArtifactTree(tree, false).map(function (node) {
                return node.path;
            }),
            [ 'package.json', 'kept', 'kept/deep', 'kept/deep/a.js' ]
        );
        assert.strictEqual(hiddenArtifactCount(tree, false), 2);
        assert.deepStrictEqual(visibleArtifactTree(tree, true), tree);
        assert.strictEqual(hiddenArtifactCount(tree, true), 0);
    });
});
