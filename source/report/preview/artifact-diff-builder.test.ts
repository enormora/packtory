import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
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
        badges: [ 'import-path-rewrite' ],
        ...overrides
    };
}

function bundleIndex(
    packageName: string,
    entries: ReadonlyMap<string, { readonly content: string; readonly sourcePath?: string; }>
): BundleArtifactIndex {
    return new Map([ [ packageName, entries ] ]);
}

async function alwaysRead(originalContent: string): Promise<(filePath: string) => Promise<string>> {
    return async function () {
        return originalContent;
    };
}

suite('artifact-diff-builder', function () {
    test('buildDiffForArtifact returns undefined when the artifact is not diffable', async function () {
        const nonDiffable = diffableArtifact({ status: 'unchanged', badges: [] });
        const result = await buildDiffForArtifact('pkg-a', nonDiffable, new Map(), async function () {
            return '';
        });

        assert.strictEqual(result, undefined);
    });

    test('buildDiffForArtifact returns undefined when the source path no longer matches the indexed artifact', async function () {
        const index = bundleIndex('pkg-a', new Map([ [ 'a.js', { content: 'final', sourcePath: '/src/other.js' } ] ]));
        const result = await buildDiffForArtifact('pkg-a', diffableArtifact(), index, async function () {
            return 'final';
        });

        assert.strictEqual(result, undefined);
    });

    test('buildDiffForArtifact returns undefined when the original and final content match exactly', async function () {
        const index = bundleIndex('pkg-a', new Map([ [ 'a.js', { content: 'same-bytes', sourcePath: '/src/a.js' } ] ]));
        const result = await buildDiffForArtifact('pkg-a', diffableArtifact(), index, await alwaysRead('same-bytes'));

        assert.strictEqual(result, undefined);
    });

    test('buildDiffForArtifact returns hunks when the original and final content differ', async function () {
        const index = bundleIndex(
            'pkg-a',
            new Map([ [ 'a.js', { content: 'export const kept = 1;', sourcePath: '/src/a.js' } ] ])
        );
        const result = await buildDiffForArtifact(
            'pkg-a',
            diffableArtifact(),
            index,
            await alwaysRead('export const removed = 1;')
        );

        assertDefined(result);
        assert.ok(result.length > 0);
        assert.match(result[0]?.header ?? '', /^@@ -\d+,\d+ \+\d+,\d+ @@$/u);
    });
});
