import assert from 'node:assert';
import { suite, test } from 'mocha';
import { linkedBundle } from '../../test-libraries/bundle-fixtures.ts';
import { indexBundles, resolveCrossBundleTarget } from './bundle-index.ts';

suite('bundle-index', function () {
    test('indexBundles keys bundles by their name', function () {
        const indexed = indexBundles([
            { bundle: linkedBundle({ name: 'pkg-a' }), fileBindings: [] },
            { bundle: linkedBundle({ name: 'pkg-b' }), fileBindings: [] }
        ]);
        assert.deepStrictEqual(Array.from(indexed.keys()), ['pkg-a', 'pkg-b']);
    });

    test('indexBundles places each file binding into its file-path lookup map', function () {
        const indexed = indexBundles([
            {
                bundle: linkedBundle({ name: 'pkg-a' }),
                fileBindings: [
                    { sourceFilePath: '/a/index.ts', sourceFile: undefined as never, bindings: [] },
                    { sourceFilePath: '/a/helpers.ts', sourceFile: undefined as never, bindings: [] }
                ]
            }
        ]);
        const bundle = indexed.get('pkg-a');
        assert.deepStrictEqual(Array.from(bundle?.bindingsByFilePath.keys() ?? []), ['/a/index.ts', '/a/helpers.ts']);
    });

    test('indexBundles attaches the originating bundle to each indexed entry', function () {
        const bundle = linkedBundle({ name: 'pkg-a' });
        const indexed = indexBundles([{ bundle, fileBindings: [] }]);
        assert.strictEqual(indexed.get('pkg-a')?.bundle, bundle);
    });

    test('resolveCrossBundleTarget returns undefined when the indexed bundle does not expose the specifier', function () {
        assert.strictEqual(
            resolveCrossBundleTarget(
                'pkg-a/private.js',
                indexBundles([{ bundle: linkedBundle({ name: 'pkg-a' }), fileBindings: [] }])
            ),
            undefined
        );
    });

    test('resolveCrossBundleTarget returns undefined when no bundles are indexed', function () {
        const result = resolveCrossBundleTarget('pkg-b/helpers.ts', new Map());
        assert.strictEqual(result, undefined);
    });
});
