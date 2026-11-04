import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createPreviewPackageFixture, createArtifactEntryFixture } from '../../test-libraries/preview-fixtures.ts';
import { buildArtifactTree } from '../preview/artifact-tree-builder.ts';
import { renderWorkspaceComparison } from './workspace-package-renderer.ts';

suite('workspace package renderer', function () {
    test('renders both tree views and escapes every comparison cell', function () {
        const tree = buildArtifactTree([
            createArtifactEntryFixture({ path: 'changed.js', status: 'changed' }),
            createArtifactEntryFixture({ path: 'retained.js', status: 'unchanged' })
        ]);
        const markup = renderWorkspaceComparison(createPreviewPackageFixture({
            sourceTree: tree,
            tree,
            comparisonRows: [
                { label: '<label>', before: '<before>', after: '<after>' },
                { label: 'same', before: 'same', after: 'same' },
                { label: 'another', before: 'same', after: 'same' },
                { label: 'unknown', before: 'unknown exports', after: 'unknown exports' }
            ]
        }));
        assert.strictEqual(markup.split('retained.js').length - 1, 2);
        const fragments = [
            '<h3>Workspace sources</h3>',
            '</td></tr><tr class="unchanged-row"><th scope="row">same',
            '<h3>Artifacts</h3>',
            '<h3>API and dependencies</h3>',
            '<div class="tree-changes"><ul class="tree">',
            '<div class="tree-all"><ul class="tree">',
            '1 unchanged files hidden',
            '<tr class="changed-row"><th scope="row">&lt;label&gt;</th><td>&lt;before&gt;</td><td>&lt;after&gt;</td></tr>',
            '<tr class="unchanged-row"><th scope="row">same</th><td>same</td><td>same</td></tr>',
            '<tr class="changed-row"><th scope="row">unknown</th><td>unknown exports</td><td>unknown exports</td></tr>',
            '<p class="tree-changes">2 unchanged comparison rows hidden</p>',
            '<table><thead><tr><th scope="col">API or dependency</th><th scope="col">Workspace</th><th scope="col">Package</th></tr></thead><tbody>'
        ];
        assert.deepStrictEqual(
            fragments.filter(function (fragment) {
                return !markup.includes(fragment);
            }),
            []
        );
    });

    test('keeps missing source and comparison information explicit', function () {
        const markup = renderWorkspaceComparison(createPreviewPackageFixture());
        assert.strictEqual(markup.split('<p>Comparison unavailable</p>').length - 1, 2);
    });
});
