import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PreviewPackage } from '../preview/preview-package.ts';
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
function workspacePackage(): PreviewPackage {
    return createPreviewPackageFixture({
        tree: buildArtifactTree([ manifest, visible, hidden ]),
        sourceTree: buildArtifactTree([ visible, hidden ]),
        comparisonRows: [
            { label: 'dep', before: '^1', after: '^2' },
            { label: 'same', before: '^1', after: '^1' },
            { label: 'unresolved', before: 'unknown exports', after: 'unknown exports' }
        ]
    });
}

suite('terminal workspace contract', function () {
    test('reports exact artifact counts and failure details', function () {
        assert.strictEqual(
            renderPackageSummary(workspacePackage()),
            'package-a: 1 transformed, 1 generated, 1 removed'
        );
        assert.strictEqual(
            renderPackageSummary({ ...workspacePackage(), failure: { stage: 'build', message: 'boom' } }),
            'package-a: 1 transformed, 1 generated, 1 removed; failure build: boom'
        );
    });

    test('renders selected changes with source rows and comparison rows separated by newlines', function () {
        const colors = createColors(false);
        assert.strictEqual(
            renderWorkspacePackage(workspacePackage(), false, colors),
            [
                renderPackage({ ...workspacePackage(), tree: buildArtifactTree([ manifest, visible ]) }, colors),
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
        const colors = createColors(false);
        assert.strictEqual(
            renderWorkspacePackage(workspacePackage(), true, colors),
            [
                renderPackage(workspacePackage(), colors),
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
        const colors = createColors(false);
        assert.strictEqual(
            renderWorkspacePackage(createPreviewPackageFixture(), false, colors)
                .split('Comparison unavailable')
                .length - 1,
            2
        );
        const output = renderTerminalPreview(
            createPreviewDocumentFixture({ selectedPackage: 'package-a', packages: [ workspacePackage() ] }),
            { color: false }
        );
        assert.ok(output.includes('Workspace sources'));
        assert.ok(!output.includes('hidden.js'));
    });
});
