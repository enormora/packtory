import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PreviewArtifactNode } from '../preview/artifact-tree-builder.ts';
import { renderArtifactNode } from './terminal-artifact-renderer.ts';
import { createColors } from './terminal-preview-renderer-shared.ts';

function colors() {
    return createColors(false);
}

suite('terminal-artifact-renderer', function () {
    test('renderArtifactNode renders a directory with a triangle marker indented by depth', function () {
        const node: PreviewArtifactNode = { type: 'directory', name: 'src', path: 'src/', depth: 1 };

        assert.strictEqual(renderArtifactNode(node, colors()), '    ▸ src/');
    });

    test('renderArtifactNode renders a file node with kind, byte size, status and badge labels', function () {
        const node: PreviewArtifactNode = {
            type: 'file',
            name: 'index.js',
            path: 'src/index.js',
            depth: 0,
            artifact: {
                path: 'src/index.js',
                sizeBytes: 42,
                kind: 'source',
                status: 'changed',
                badges: ['import-path-rewrite']
            }
        };

        assert.strictEqual(renderArtifactNode(node, colors()), '  • src/index.js (source, 42 B) [changed, rewrite]');
    });

    test('renderArtifactNode omits trailing whitespace when there are no badges and the status label is empty', function () {
        const node: PreviewArtifactNode = {
            type: 'file',
            name: 'file.txt',
            path: 'file.txt',
            depth: 0,
            artifact: { path: 'file.txt', sizeBytes: 0, kind: 'additional', status: 'unchanged', badges: [] }
        };

        assert.strictEqual(renderArtifactNode(node, colors()).endsWith(' '), false);
    });
});
