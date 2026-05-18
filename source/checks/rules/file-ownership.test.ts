/* eslint-disable @typescript-eslint/no-unnecessary-condition -- test stubs cast partial mocks of complex orchestrator types */
import assert from 'node:assert';
import { test } from 'mocha';
import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import { collectFileOwnership } from './file-ownership.ts';

function bundle(
    name: string,
    files: readonly { readonly sourceFilePath: string; readonly survivingBindings: readonly string[] }[]
): Pick<AnalyzedBundle, 'contents' | 'name'> {
    return {
        name,
        contents: files.map((file) => ({
            fileDescription: { sourceFilePath: file.sourceFilePath },
            analysis: { survivingBindings: new Set(file.survivingBindings) }
        }))
    } as unknown as Pick<AnalyzedBundle, 'contents' | 'name'>;
}

test('collectFileOwnership returns an empty map when given no bundles', () => {
    const ownership = collectFileOwnership([]);
    assert.strictEqual(ownership.size, 0);
});

test('collectFileOwnership keys ownership entries by source file path', () => {
    const ownership = collectFileOwnership([
        bundle('pkg-a', [{ sourceFilePath: '/src/a.ts', survivingBindings: ['x'] }])
    ]);
    assert.deepStrictEqual(Array.from(ownership.keys()), ['/src/a.ts']);
});

test('collectFileOwnership accumulates one owner per bundle that contains the file', () => {
    const ownership = collectFileOwnership([
        bundle('pkg-a', [{ sourceFilePath: '/src/shared.ts', survivingBindings: ['x'] }]),
        bundle('pkg-b', [{ sourceFilePath: '/src/shared.ts', survivingBindings: ['y'] }])
    ]);

    const owners = ownership.get('/src/shared.ts');
    assert.deepStrictEqual(
        owners?.map((owner) => owner.bundleName),
        ['pkg-a', 'pkg-b']
    );
    assert.deepStrictEqual(Array.from(owners?.[0]?.survivingBindings ?? []), ['x']);
    assert.deepStrictEqual(Array.from(owners?.[1]?.survivingBindings ?? []), ['y']);
});
