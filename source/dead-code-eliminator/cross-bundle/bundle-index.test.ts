import assert from 'node:assert';
import { suite, test } from 'mocha';
import { linkedBundle } from '../../test-libraries/bundle-fixtures.ts';
import { indexBundles } from './bundle-index.ts';

suite('bundle-index', function () {
    test('indexBundles keys bundles by their name', function () {
        const indexed = indexBundles([
            { bundle: linkedBundle({ name: 'pkg-a' }), fileBindings: [] },
            { bundle: linkedBundle({ name: 'pkg-b' }), fileBindings: [] }
        ]);
        assert.deepStrictEqual(Array.from(indexed.keys()), [ 'pkg-a', 'pkg-b' ]);
    });

    test('indexBundles places each file binding into its file-path lookup map', function () {
        const indexed = indexBundles([
            {
                bundle: linkedBundle({ name: 'pkg-a' }),
                fileBindings: [
                    {
                        inputFilePath: '/a/index.ts',
                        parsedInputFilePath: '/a/index.ts',
                        targetFilePath: 'index.ts',
                        sourceFile: undefined as never,
                        moduleReferences: [],
                        bindings: []
                    },
                    {
                        inputFilePath: '/a/helpers.ts',
                        parsedInputFilePath: '/a/helpers.ts',
                        targetFilePath: 'helpers.ts',
                        sourceFile: undefined as never,
                        moduleReferences: [],
                        bindings: []
                    }
                ]
            }
        ]);
        const bundle = indexed.get('pkg-a');
        assert.deepStrictEqual(Array.from(bundle?.bindingsByFilePath.keys() ?? []), [ 'index.ts', 'helpers.ts' ]);
    });

    test('indexBundles attaches the originating bundle to each indexed entry', function () {
        const bundle = linkedBundle({ name: 'pkg-a' });
        const indexed = indexBundles([ { bundle, fileBindings: [] } ]);
        assert.strictEqual(indexed.get('pkg-a')?.bundle, bundle);
    });
});
