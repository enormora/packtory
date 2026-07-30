import assert from 'node:assert';
import { suite, test } from 'mocha';
import { declarationRootsFromManifest } from './type-script-declaration-roots.ts';

function rootsOf(manifest: unknown): readonly string[] {
    return Array.from(declarationRootsFromManifest(JSON.stringify(manifest)));
}

suite('type-script-declaration-roots', function () {
    test('collects the top-level types field without its relative prefix', function () {
        assert.deepStrictEqual(rootsOf({ types: './index.d.ts' }), [ 'index.d.ts' ]);
    });

    test('collects the top-level typings field', function () {
        assert.deepStrictEqual(rootsOf({ typings: './typings/index.d.ts' }), [ 'typings/index.d.ts' ]);
    });

    test('keeps paths that are given without a relative prefix', function () {
        assert.deepStrictEqual(rootsOf({ types: 'index.d.ts' }), [ 'index.d.ts' ]);
    });

    test('collects every path nested in the exports field', function () {
        assert.deepStrictEqual(
            rootsOf({
                exports: {
                    '.': { types: './index.d.ts', import: './index.js' },
                    './feature': [ { typings: './feature.d.ts' }, './feature.js' ]
                }
            }),
            [ 'index.d.ts', 'index.js', 'feature.d.ts', 'feature.js' ]
        );
    });

    test('collects each path only once', function () {
        assert.deepStrictEqual(
            rootsOf({ types: './index.d.ts', exports: { '.': { types: './index.d.ts' } } }),
            [ 'index.d.ts' ]
        );
    });

    test('ignores null branches inside the exports field', function () {
        assert.deepStrictEqual(rootsOf({ exports: { '.': null, './feature': './feature.d.ts' } }), [ 'feature.d.ts' ]);
    });

    test('ignores non-string leaf values inside the exports field', function () {
        assert.deepStrictEqual(rootsOf({ exports: { '.': 42, './other': false } }), []);
    });

    test('ignores other manifest fields', function () {
        assert.deepStrictEqual(rootsOf({ name: 'pkg', main: './index.js', files: [ './index.d.ts' ] }), []);
    });

    test('returns no roots for a manifest that is not an object', function () {
        assert.deepStrictEqual(rootsOf(null), []);
        assert.deepStrictEqual(rootsOf([ './index.d.ts' ]), []);
        assert.deepStrictEqual(rootsOf('./index.d.ts'), []);
    });
});
