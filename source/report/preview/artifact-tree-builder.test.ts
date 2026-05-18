/* eslint-disable @typescript-eslint/no-unnecessary-condition -- test stubs cast partial mocks of complex orchestrator types */
import assert from 'node:assert';
import { test } from 'mocha';
import type { ArtifactEntry } from '../../progress/progress-broadcaster.ts';
import { buildArtifactTree, type PreviewArtifact } from './artifact-tree-builder.ts';

function artifact(path: string, overrides: Partial<ArtifactEntry> = {}): PreviewArtifact {
    return { path, sizeBytes: 0, kind: 'additional', status: 'unchanged', badges: [], ...overrides };
}

test('buildArtifactTree returns an empty array when no artifacts are given', () => {
    assert.deepStrictEqual(buildArtifactTree([]), []);
});

test('buildArtifactTree returns a single file node for an artifact at the root', () => {
    const [node, ...rest] = buildArtifactTree([artifact('package.json', { kind: 'manifest' })]);
    assert.strictEqual(node?.type, 'file');
    assert.strictEqual(node?.path, 'package.json');
    assert.deepStrictEqual(rest, []);
});

test('buildArtifactTree orders the root package.json before directories and nested files', () => {
    const nodes = buildArtifactTree([artifact('src/index.js'), artifact('package.json', { kind: 'manifest' })]);

    const types = nodes.map((node) => node.type);
    assert.deepStrictEqual(types, ['file', 'directory', 'file']);
    assert.strictEqual(nodes[0]?.name, 'package.json');
    assert.strictEqual(nodes[1]?.name, 'src');
    assert.strictEqual(nodes[2]?.path, 'src/index.js');
});

test('buildArtifactTree assigns increasing depth to nested directories and the leaf file', () => {
    const nodes = buildArtifactTree([artifact('src/lib/util.js')]);
    const depths = nodes.map((node) => node.depth);
    assert.deepStrictEqual(depths, [1, 2, 2]);
});
