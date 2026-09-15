import assert from 'node:assert';
import { suite, test } from 'mocha';
import { sideEffectAssetImportKind } from './asset-side-effects.ts';

suite('asset-side-effects', function () {
    test('classifies stylesheet imports as side-effect asset imports', function () {
        assert.deepStrictEqual(
            [
                sideEffectAssetImportKind('global.css'),
                sideEffectAssetImportKind('theme.less'),
                sideEffectAssetImportKind('layout.sass'),
                sideEffectAssetImportKind('component.scss')
            ],
            [ 'css import', 'less import', 'sass import', 'scss import' ]
        );
    });

    test('ignores non-stylesheet imports', function () {
        assert.strictEqual(sideEffectAssetImportKind('image.svg'), undefined);
        assert.strictEqual(sideEffectAssetImportKind('style.css.js'), undefined);
    });
});
