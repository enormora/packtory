import assert from 'node:assert';
import { suite, test } from 'mocha';
import { candidatesFor, declarationCandidates } from './target-candidates.ts';

suite('dead code elimination target candidates', function () {
    test('expands runtime candidates with supported runtime extensions', function () {
        assert.deepStrictEqual(candidatesFor('runtime', 'feature'), [
            'feature',
            'feature.js',
            'feature.jsx',
            'feature.mjs',
            'feature.cjs',
            'feature.ts',
            'feature.tsx',
            'feature.mts',
            'feature.cts',
            'feature.json',
            'feature.wasm'
        ]);
    });

    test('expands declaration candidates from source and declaration paths', function () {
        assert.deepStrictEqual(declarationCandidates('feature.ts'), [
            'feature.ts',
            'feature.d.ts',
            'feature.ts.d.ts',
            'feature.ts.d.mts',
            'feature.ts.d.cts'
        ]);
        assert.deepStrictEqual(declarationCandidates('feature.mts'), [
            'feature.mts',
            'feature.d.mts',
            'feature.d.ts',
            'feature.mts.d.ts',
            'feature.mts.d.mts',
            'feature.mts.d.cts'
        ]);
        assert.deepStrictEqual(declarationCandidates('feature.cts'), [
            'feature.cts',
            'feature.d.cts',
            'feature.d.ts',
            'feature.cts.d.ts',
            'feature.cts.d.mts',
            'feature.cts.d.cts'
        ]);
        assert.deepStrictEqual(declarationCandidates('feature.d.ts'), [
            'feature.d.ts',
            'feature.d.ts.d.ts',
            'feature.d.ts.d.mts',
            'feature.d.ts.d.cts'
        ]);
        assert.deepStrictEqual(declarationCandidates('feature'), [
            'feature',
            'feature.d.ts',
            'feature.d.mts',
            'feature.d.cts'
        ]);
    });

    test('routes candidate generation by check mode', function () {
        assert.deepStrictEqual(candidatesFor('declaration', 'feature.tsx'), [
            'feature.tsx',
            'feature.d.ts',
            'feature.tsx.d.ts',
            'feature.tsx.d.mts',
            'feature.tsx.d.cts'
        ]);
    });
});
