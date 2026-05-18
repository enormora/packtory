import assert from 'node:assert';
import { test } from 'mocha';
import type { ArtifactEntry } from '../../progress/progress-broadcaster.ts';
import { buildDiffForArtifact } from './artifact-diff-builder.ts';
import type { BundleArtifactIndex } from './bundle-artifact-index.ts';

function diffableArtifact(overrides: Partial<ArtifactEntry> = {}): ArtifactEntry {
    return {
        path: 'a.js',
        sizeBytes: 0,
        kind: 'source',
        sourcePath: '/src/a.js',
        status: 'changed',
        badges: ['import-path-rewrite'],
        ...overrides
    };
}

function bundleIndex(
    packageName: string,
    entries: Map<string, { content: string; sourcePath?: string }>
): BundleArtifactIndex {
    return new Map([[packageName, entries]]);
}

async function alwaysRead(originalContent: string): Promise<(filePath: string) => Promise<string>> {
    return async () => originalContent;
}

test('buildDiffForArtifact returns undefined when the artifact is not diffable', async () => {
    const nonDiffable = diffableArtifact({ status: 'unchanged', badges: [] });
    const result = await buildDiffForArtifact('pkg-a', nonDiffable, new Map(), async () => '');

    assert.strictEqual(result, undefined);
});

test('buildDiffForArtifact returns undefined when the source path no longer matches the indexed artifact', async () => {
    const index = bundleIndex('pkg-a', new Map([['a.js', { content: 'final', sourcePath: '/src/other.js' }]]));
    const result = await buildDiffForArtifact('pkg-a', diffableArtifact(), index, async () => 'final');

    assert.strictEqual(result, undefined);
});

test('buildDiffForArtifact returns undefined when the original and final content match exactly', async () => {
    const index = bundleIndex('pkg-a', new Map([['a.js', { content: 'same-bytes', sourcePath: '/src/a.js' }]]));
    const result = await buildDiffForArtifact('pkg-a', diffableArtifact(), index, await alwaysRead('same-bytes'));

    assert.strictEqual(result, undefined);
});

test('buildDiffForArtifact returns hunks when the original and final content differ', async () => {
    const index = bundleIndex(
        'pkg-a',
        new Map([['a.js', { content: 'export const kept = 1;', sourcePath: '/src/a.js' }]])
    );
    const result = await buildDiffForArtifact(
        'pkg-a',
        diffableArtifact(),
        index,
        await alwaysRead('export const removed = 1;')
    );

    assert.notStrictEqual(result, undefined);
    assert.ok((result ?? []).length > 0);
    assert.match((result ?? [])[0]?.header ?? '', /^@@ -\d+,\d+ \+\d+,\d+ @@$/u);
});
