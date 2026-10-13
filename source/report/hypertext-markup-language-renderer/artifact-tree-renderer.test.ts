import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PreviewArtifactNode } from '../preview/artifact-tree-builder.ts';
import { renderArtifactNode } from './artifact-tree-renderer.ts';

suite('artifact-tree-renderer', function () {
    test('renderArtifactNode renders a directory entry with the depth-driven indentation', function () {
        const directory: PreviewArtifactNode = {
            type: 'directory',
            name: 'source',
            path: 'source',
            depth: 1
        };

        assert.strictEqual(
            renderArtifactNode(directory),
            '<li class="tree-row directory" style="--depth:1"><span class="tree-name">source/</span></li>'
        );
    });

    test('renderArtifactNode renders a file entry with the kind, byte size, and a status badge', function () {
        const file: PreviewArtifactNode = {
            type: 'file',
            name: 'index.js',
            path: 'source/index.js',
            depth: 1,
            artifact: {
                path: 'source/index.js',
                sizeBytes: 20,
                kind: 'source',
                sourcePath: '/source/index.js',
                status: 'changed',
                badges: []
            }
        };
        const hypertextMarkupLanguage = renderArtifactNode(file);

        assert.ok(hypertextMarkupLanguage.includes('class="tree-row file"'));
        assert.ok(hypertextMarkupLanguage.includes('<span class="tree-name">index.js</span>'));
        assert.ok(hypertextMarkupLanguage.includes('source · 20 B'));
        assert.ok(hypertextMarkupLanguage.includes('<span class="badge status-changed">changed</span>'));
    });

    test('renderArtifactNode renders additional artifact badges as secondary badges', function () {
        const file: PreviewArtifactNode = {
            type: 'file',
            name: 'index.js',
            path: 'source/index.js',
            depth: 0,
            artifact: {
                path: 'source/index.js',
                sizeBytes: 0,
                kind: 'source',
                sourcePath: '/source/index.js',
                status: 'generated',
                badges: [ 'import-path-rewrite' ]
            }
        };
        const hypertextMarkupLanguage = renderArtifactNode(file);

        assert.ok(hypertextMarkupLanguage.includes('<span class="badge status-generated">generated</span>'));
        assert.ok(hypertextMarkupLanguage.includes('<span class="badge secondary">'));
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
                sourcePath: '/source/a.js',
                status: 'unchanged',
                badges: []
            }
        };
        const hypertextMarkupLanguage = renderArtifactNode(file);

        assert.ok(hypertextMarkupLanguage.includes('a&lt;b&gt;.js'));
    });
});
