/* eslint-disable @typescript-eslint/consistent-type-assertions -- test stubs cast partial mocks of complex orchestrator types */
import assert from 'node:assert';
import { test } from 'mocha';
import type { PreviewArtifactNode } from './artifact-tree-builder.ts';
import { summarizePackages } from './preview-summary.ts';

function fileNode(status: 'changed' | 'generated' | 'unchanged'): PreviewArtifactNode {
    return {
        type: 'file',
        name: 'index.js',
        path: 'index.js',
        depth: 0,
        artifact: { path: 'index.js', sizeBytes: 0, kind: 'source', status, badges: [] }
    };
}

const directoryNode: PreviewArtifactNode = { type: 'directory', name: 'src', path: 'src', depth: 0 };

test('summarizePackages returns zero counts for an empty package list', () => {
    assert.deepStrictEqual(summarizePackages([]), {
        totalPackages: 0,
        changedPackages: 0,
        unchangedPackages: 0,
        failedPackages: 0,
        emittedArtifacts: 0,
        changedArtifacts: 0,
        eliminatedSourceFiles: 0
    });
});

test('summarizePackages counts a package as changed when it has changes', () => {
    const summary = summarizePackages([{ hasChanges: true, eliminatedSourceFiles: [], tree: [fileNode('changed')] }]);
    assert.strictEqual(summary.changedPackages, 1);
    assert.strictEqual(summary.unchangedPackages, 0);
});

test('summarizePackages counts an unchanged success as an unchanged package', () => {
    const summary = summarizePackages([{ hasChanges: false, eliminatedSourceFiles: [], tree: [] }]);
    assert.strictEqual(summary.unchangedPackages, 1);
    assert.strictEqual(summary.changedPackages, 0);
});

test('summarizePackages counts a package as failed when it has a failure entry', () => {
    const summary = summarizePackages([
        {
            hasChanges: false,
            failure: { stage: 'publish', message: 'boom' } as never,
            eliminatedSourceFiles: [],
            tree: []
        }
    ]);
    assert.strictEqual(summary.failedPackages, 1);
});

test('summarizePackages sums emitted and changed artifacts across packages and ignores directories', () => {
    const summary = summarizePackages([
        {
            hasChanges: true,
            eliminatedSourceFiles: [{ path: '/a.js' }],
            tree: [directoryNode, fileNode('changed'), fileNode('unchanged')]
        }
    ]);
    assert.strictEqual(summary.emittedArtifacts, 2);
    assert.strictEqual(summary.changedArtifacts, 1);
    assert.strictEqual(summary.eliminatedSourceFiles, 1);
});
