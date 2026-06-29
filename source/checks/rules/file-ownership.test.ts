import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import { analyzedBundle, analyzedBundleResource } from '../../test-libraries/bundle-fixtures.ts';
import { collectFileOwnership } from './file-ownership.ts';

function bundle(
    name: string,
    files: readonly { readonly sourceFilePath: string; readonly survivingBindings: readonly string[]; }[]
): AnalyzedBundle {
    return analyzedBundle({
        name,
        contents: files.map(function (file) {
            return analyzedBundleResource(file.sourceFilePath, {
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
            bundle('pkg-a', [ { sourceFilePath: '/src/a.ts', survivingBindings: [ 'x' ] } ])
        ]);
        assert.deepStrictEqual(Array.from(ownership.keys()), [ '/src/a.ts' ]);
    });

    test('collectFileOwnership accumulates one owner per bundle that contains the file', function () {
        const ownership = collectFileOwnership([
            bundle('pkg-a', [ { sourceFilePath: '/src/shared.ts', survivingBindings: [ 'x' ] } ]),
            bundle('pkg-b', [ { sourceFilePath: '/src/shared.ts', survivingBindings: [ 'y' ] } ])
        ]);

        const owners = ownership.get('/src/shared.ts');
        if (owners === undefined) {
            assert.fail('expected ownership for /src/shared.ts');
        }
        assert.deepStrictEqual(
            owners.map(function (owner) {
                return owner.bundleName;
            }),
            [ 'pkg-a', 'pkg-b' ]
        );
        assert.deepStrictEqual(Array.from(owners[0]?.survivingBindings ?? []), [ 'x' ]);
        assert.deepStrictEqual(Array.from(owners[1]?.survivingBindings ?? []), [ 'y' ]);
    });
});
