import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PreviewPackage } from '../preview/preview-package.ts';
import {
    createPreviewDocumentFixture,
    createPreviewPackageFixture,
    createArtifactEntryFixture
} from '../../test-libraries/preview-fixtures.ts';
import { buildArtifactTree } from '../preview/artifact-tree-builder.ts';
import { renderTerminalPreview } from './terminal-preview-renderer.ts';

suite('terminal workspace preview', function () {
    function workspacePackage(): PreviewPackage {
        const tree = buildArtifactTree([
            createArtifactEntryFixture({ path: 'visible.js', status: 'changed' }),
            createArtifactEntryFixture({ path: 'hidden.js', status: 'unchanged' })
        ]);
        return createPreviewPackageFixture({
            sourceTree: tree,
            tree,
            comparisonRows: [
                { label: 'dep', before: '^1', after: '^2' },
                { label: 'same', before: '^1', after: '^1' },
                { label: 'unresolved', before: 'unknown exports', after: 'unknown exports' }
            ]
        });
    }

    test('lists summaries and keeps failures visible without package detail', function () {
        const output = renderTerminalPreview(
            createPreviewDocumentFixture({
                allFiles: false,
                packages: [
                    workspacePackage(),
                    createPreviewPackageFixture({ name: 'failed', failure: { stage: 'build', message: 'boom' } })
                ]
            }),
            { color: false }
        );
        assert.ok(output.includes('package-a:'));
        assert.ok(output.includes('transformed'));
        assert.ok(output.includes('generated'));
        assert.ok(output.includes('failure build: boom'));
        assert.ok(!output.includes('visible.js'));
    });

    test('shows selected changes, hidden counts, and unknown exports', function () {
        const output = renderTerminalPreview(
            createPreviewDocumentFixture({
                selectedPackage: 'package-a',
                allFiles: false,
                packages: [ workspacePackage() ]
            }),
            { color: false }
        );
        assert.ok(output.includes('visible.js'));
        assert.ok(!output.includes('hidden.js'));
        assert.ok(output.includes('1 unchanged output files hidden'));
        assert.ok(output.includes('1 unchanged comparison rows hidden'));
        assert.ok(output.includes('dep: ^1 -> ^2'));
        assert.ok(output.includes('unresolved: unknown exports -> unknown exports'));
        assert.ok(!output.includes('same:'));
    });

    test('reveals unchanged entries and handles unavailable comparisons', function () {
        const output = renderTerminalPreview(
            createPreviewDocumentFixture({
                selectedPackage: 'package-a',
                allFiles: true,
                packages: [ workspacePackage() ]
            }),
            { color: false }
        );
        assert.ok(output.includes('hidden.js'));
        assert.ok(output.includes('same: ^1 -> ^1'));
        assert.ok(output.includes('0 unchanged comparison rows hidden'));
        const missing = renderTerminalPreview(
            createPreviewDocumentFixture({ selectedPackage: 'package-a', allFiles: false }),
            { color: false }
        );
        assert.ok(missing.includes('Comparison unavailable'));
    });
});
