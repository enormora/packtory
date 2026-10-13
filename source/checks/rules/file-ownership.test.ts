import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import { analyzedBundle, analyzedBundleResource } from '../../test-libraries/bundle-fixtures.ts';
import { collectFileOwnership } from './file-ownership.ts';

function bundle(
    name: string,
    files: readonly { readonly inputFilePath: string; readonly survivingBindings: readonly string[]; }[]
): AnalyzedBundle {
    return analyzedBundle({
        name,
        contents: files.map(function (file) {
            return analyzedBundleResource(file.inputFilePath, {
                analysis: { survivingBindings: new Set(file.survivingBindings) }
            });
        })
    });
}

suite('file-ownership', function () {
    test('collectFileOwnership returns an empty map when given no bundles', function () {
        const ownership = collectFileOwnership([]);
        assert.strictEqual(ownership.size, 0);
    });

    test('collectFileOwnership keys ownership entries by source file path', function () {
        const ownership = collectFileOwnership([
            bundle('package-a', [ { inputFilePath: '/source/a.ts', survivingBindings: [ 'x' ] } ])
        ]);
        assert.deepStrictEqual(Array.from(ownership.keys()), [ '/source/a.ts' ]);
    });

    test('collectFileOwnership accumulates one owner per bundle that contains the file', function () {
        const ownership = collectFileOwnership([
            bundle('package-a', [ { inputFilePath: '/source/shared.ts', survivingBindings: [ 'x' ] } ]),
            bundle('package-b', [ { inputFilePath: '/source/shared.ts', survivingBindings: [ 'y' ] } ])
        ]);

        const owners = ownership.get('/source/shared.ts');
        if (owners === undefined) {
            assert.fail('expected ownership for /source/shared.ts');
        }
        assert.deepStrictEqual(
            owners.map(function (owner) {
                return owner.bundleName;
            }),
            [ 'package-a', 'package-b' ]
        );
        assert.deepStrictEqual(Array.from(owners[0]?.survivingBindings ?? []), [ 'x' ]);
        assert.deepStrictEqual(Array.from(owners[1]?.survivingBindings ?? []), [ 'y' ]);
    });
});
