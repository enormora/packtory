import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    createPreviewPackageFixture,
    createPreviewDocumentFixture,
    createArtifactEntryFixture
} from '../../test-libraries/preview-fixtures.ts';
import { buildArtifactTree } from '../preview/artifact-tree-builder.ts';
import { renderPackage } from './terminal-package-renderer.ts';
import { createColors } from './terminal-preview-renderer-shared.ts';
import { renderWorkspacePackage, renderPackageSummary } from './terminal-workspace-preview.ts';
import { renderTerminalPreview } from './terminal-preview-renderer.ts';

const visible = createArtifactEntryFixture({ path: 'visible.js', status: 'changed' });
const hidden = createArtifactEntryFixture({ path: 'hidden.js', status: 'unchanged' });
const manifest = createArtifactEntryFixture({ kind: 'manifest', status: 'generated' });
const previewPackage = createPreviewPackageFixture({
    tree: buildArtifactTree([ manifest, visible, hidden ]),
    sourceTree: buildArtifactTree([ visible, hidden ]),
    comparisonRows: [
        { label: 'dep', before: '^1', after: '^2' },
        { label: 'same', before: '^1', after: '^1' },
        { label: 'unresolved', before: 'unknown exports', after: 'unknown exports' }
    ]
});
const colors = createColors(false);

suite('terminal workspace contract', function () {
    test('reports exact artifact counts and failure details', function () {
        assert.strictEqual(renderPackageSummary(previewPackage), 'package-a: 1 transformed, 1 generated, 1 removed');
        assert.strictEqual(
            renderPackageSummary({ ...previewPackage, failure: { stage: 'build', message: 'boom' } }),
            'package-a: 1 transformed, 1 generated, 1 removed; failure build: boom'
        );
    });

    test('renders selected changes with source rows and comparison rows separated by newlines', function () {
        assert.strictEqual(
            renderWorkspacePackage(previewPackage, false, colors),
            [
                renderPackage({ ...previewPackage, tree: buildArtifactTree([ manifest, visible ]) }, colors),
                '1 unchanged output files hidden',
                'Workspace sources',
                '  • visible.js (source, 20 B) [changed]',
                'API and dependencies',
                'dep: ^1 -> ^2',
                'unresolved: unknown exports -> unknown exports',
                '1 unchanged comparison rows hidden'
            ]
                .join('\n')
        );
    });

    test('includes unchanged sources and comparisons when requested', function () {
        assert.strictEqual(
            renderWorkspacePackage(previewPackage, true, colors),
            [
                renderPackage(previewPackage, colors),
                '0 unchanged output files hidden',
                'Workspace sources',
                '  • hidden.js (source, 20 B) [unchanged]',
                '  • visible.js (source, 20 B) [changed]',
                'API and dependencies',
                'dep: ^1 -> ^2',
                'same: ^1 -> ^1',
                'unresolved: unknown exports -> unknown exports',
                '0 unchanged comparison rows hidden'
            ]
                .join('\n')
        );
    });

    test('keeps missing source and comparison snapshots explicit and defaults selected views to changes', function () {
        assert.strictEqual(
            renderWorkspacePackage(createPreviewPackageFixture(), false, colors)
                .split('Comparison unavailable')
                .length - 1,
            2
        );
        const output = renderTerminalPreview(
            createPreviewDocumentFixture({ selectedPackage: 'package-a', packages: [ previewPackage ] }),
            { color: false }
        );
        assert.ok(output.includes('Workspace sources'));
        assert.ok(!output.includes('hidden.js'));
    });
});
