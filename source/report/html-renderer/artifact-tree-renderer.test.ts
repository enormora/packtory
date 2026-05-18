import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PreviewArtifactNode } from '../preview/artifact-tree-builder.ts';
import { renderArtifactNode } from './artifact-tree-renderer.ts';

suite('artifact-tree-renderer', function () {
    test('renderArtifactNode renders a directory entry with the depth-driven indentation', function () {
        const directory: PreviewArtifactNode = {
            type: 'directory',
            name: 'src',
            path: 'src',
            depth: 1
        };

        assert.strictEqual(
            renderArtifactNode(directory),
            '<li class="tree-row directory" style="--depth:1"><span class="tree-name">src/</span></li>'
        );
    });

    test('renderArtifactNode renders a file entry with the kind, byte size, and a status badge', function () {
        const file: PreviewArtifactNode = {
            type: 'file',
            name: 'index.js',
            path: 'src/index.js',
            depth: 1,
            artifact: {
                path: 'src/index.js',
                sizeBytes: 20,
                kind: 'source',
                sourcePath: '/src/index.js',
                status: 'changed',
                badges: []
            }
        };
        const html = renderArtifactNode(file);

        assert.ok(html.includes('class="tree-row file"'));
        assert.ok(html.includes('<span class="tree-name">index.js</span>'));
        assert.ok(html.includes('source · 20 B'));
        assert.ok(html.includes('<span class="badge status-changed">changed</span>'));
    });

    test('renderArtifactNode renders additional artifact badges as secondary badges', function () {
        const file: PreviewArtifactNode = {
            type: 'file',
            name: 'index.js',
            path: 'src/index.js',
            depth: 0,
            artifact: {
                path: 'src/index.js',
                sizeBytes: 0,
                kind: 'source',
                sourcePath: '/src/index.js',
                status: 'generated',
                badges: ['import-path-rewrite']
            }
        };
        const html = renderArtifactNode(file);

        assert.ok(html.includes('<span class="badge status-generated">generated</span>'));
        assert.ok(html.includes('<span class="badge secondary">'));
    });

    test('renderArtifactNode escapes HTML special characters in file names', function () {
        const file: PreviewArtifactNode = {
            type: 'file',
            name: 'a<b>.js',
            path: 'a<b>.js',
            depth: 0,
            artifact: {
                path: 'a<b>.js',
                sizeBytes: 0,
                kind: 'source',
                sourcePath: '/src/a.js',
                status: 'unchanged',
                badges: []
            }
        };
        const html = renderArtifactNode(file);

        assert.ok(html.includes('a&lt;b&gt;.js'));
    });
});
