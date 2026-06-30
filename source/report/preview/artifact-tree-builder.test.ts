import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { ArtifactEntry } from '../../progress/progress-broadcaster.ts';
import { buildArtifactTree, type PreviewArtifact, type PreviewArtifactNode } from './artifact-tree-builder.ts';

function artifact(path: string, overrides: Partial<ArtifactEntry> = {}): PreviewArtifact {
    return { path, sizeBytes: 0, kind: 'additional', status: 'unchanged', badges: [], ...overrides };
}

function expectFirstNode(nodes: readonly PreviewArtifactNode[]): PreviewArtifactNode {
    const [ node ] = nodes;
    if (node === undefined) {
        assert.fail('expected first node');
    }
    return node;
}

suite('artifact-tree-builder', function () {
    test('buildArtifactTree returns an empty array when no artifacts are given', function () {
        assert.deepStrictEqual(buildArtifactTree([]), []);
    });

    test('buildArtifactTree returns a single file node for an artifact at the root', function () {
        const nodes = buildArtifactTree([ artifact('package.json', { kind: 'manifest' }) ]);
        const [ , ...rest ] = nodes;
        const node = expectFirstNode(nodes);
        assert.strictEqual(node.type, 'file');
        assert.strictEqual(node.path, 'package.json');
        assert.deepStrictEqual(rest, []);
    });

    test('buildArtifactTree orders the root package.json before directories and nested files', function () {
        const nodes = buildArtifactTree([ artifact('src/index.js'), artifact('package.json', { kind: 'manifest' }) ]);

        const types = nodes.map(function (node) {
            return node.type;
        });
        assert.deepStrictEqual(types, [ 'file', 'directory', 'file' ]);
        assert.strictEqual(nodes[0]?.name, 'package.json');
        assert.strictEqual(nodes[1]?.name, 'src');
        assert.strictEqual(nodes[2]?.path, 'src/index.js');
    });

    test('buildArtifactTree assigns increasing depth to nested directories and the leaf file', function () {
        const nodes = buildArtifactTree([ artifact('src/lib/util.js') ]);
        const depths = nodes.map(function (node) {
            return node.depth;
        });
        assert.deepStrictEqual(depths, [ 1, 2, 2 ]);
    });
});
