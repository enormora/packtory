import assert from 'node:assert';
import { test } from 'mocha';
import type { PreviewArtifactNode } from '../preview/artifact-tree-builder.ts';
import type { PreviewPackage } from '../preview/preview-document.ts';
import { renderPackageDiffs } from './diff-renderer.ts';

function fileNode(
    path: string,
    overrides: { readonly diff?: PreviewArtifactNode extends { type: 'file' } ? never : never } = {}
): PreviewArtifactNode {
    return {
        type: 'file',
        name: path,
        path,
        depth: 0,
        artifact: {
            path,
            sizeBytes: 0,
            kind: 'source',
            sourcePath: `/src/${path}`,
            status: 'changed',
            badges: [],
            ...overrides
        }
    };
}

function packageWithTree(tree: readonly PreviewArtifactNode[]): Pick<PreviewPackage, 'tree'> {
    return { tree };
}

test('renderPackageDiffs returns an empty string when no file in the tree has a diff', () => {
    assert.strictEqual(renderPackageDiffs(packageWithTree([fileNode('a.js')]) as PreviewPackage), '');
});

test('renderPackageDiffs renders a Changed files section when at least one file has a diff', () => {
    const file: PreviewArtifactNode = {
        type: 'file',
        name: 'a.js',
        path: 'src/a.js',
        depth: 0,
        artifact: {
            path: 'src/a.js',
            sizeBytes: 0,
            kind: 'source',
            sourcePath: '/src/a.js',
            status: 'changed',
            badges: [],
            diff: [
                {
                    header: '@@ -1,1 +1,1 @@',
                    lines: [
                        { type: 'remove', text: '-old' },
                        { type: 'add', text: '+new' }
                    ]
                }
            ]
        }
    };
    const html = renderPackageDiffs(packageWithTree([file]) as PreviewPackage);

    assert.ok(html.includes('<h3>Changed files</h3>'));
    assert.ok(html.includes('<summary>src/a.js</summary>'));
    assert.ok(html.includes('@@ -1,1 +1,1 @@'));
    assert.ok(html.includes('<div class="diff-line remove">-old</div>'));
    assert.ok(html.includes('<div class="diff-line add">+new</div>'));
});

test('renderPackageDiffs ignores directory nodes when collecting diffs', () => {
    const dirNode: PreviewArtifactNode = { type: 'directory', name: 'src', path: 'src', depth: 0 };
    assert.strictEqual(renderPackageDiffs(packageWithTree([dirNode]) as PreviewPackage), '');
});
