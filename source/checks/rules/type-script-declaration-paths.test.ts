import assert from 'node:assert';
import { suite, test } from 'mocha';
import { declarationCandidatesFor, isDeclarationPath, isRelativeSpecifier } from './type-script-declaration-paths.ts';

suite('type-script-declaration-paths', function () {
    suite('isDeclarationPath()', function () {
        test('accepts all three declaration file extensions', function () {
            assert.deepStrictEqual(
                [ 'index.d.ts', 'index.d.mts', 'index.d.cts' ].map(isDeclarationPath),
                [ true, true, true ]
            );
        });

        test('rejects files that are not declarations', function () {
            assert.deepStrictEqual(
                [ 'index.js', 'index.mjs', 'index.cjs', 'index.ts', 'package.json', '' ].map(isDeclarationPath),
                [ false, false, false, false, false, false ]
            );
        });
    });

    suite('isRelativeSpecifier()', function () {
        test('accepts specifiers pointing at the current or the parent folder', function () {
            assert.deepStrictEqual(
                [ './leaf.js', '../leaf.js' ].map(isRelativeSpecifier),
                [ true, true ]
            );
        });

        test('rejects bare, absolute and subpath-import specifiers', function () {
            assert.deepStrictEqual(
                [ 'external', '@scope/external', '/absolute.js', '#internal', '' ].map(isRelativeSpecifier),
                [ false, false, false, false, false ]
            );
        });
    });

    suite('declarationCandidatesFor()', function () {
        test('maps a ".js" specifier to its declaration sibling', function () {
            assert.deepStrictEqual(declarationCandidatesFor('index.d.ts', './leaf.js'), [ 'leaf.d.ts' ]);
        });

        test('maps a ".mjs" specifier to the module declaration and the plain declaration', function () {
            assert.deepStrictEqual(declarationCandidatesFor('index.d.ts', './leaf.mjs'), [
                'leaf.d.mts',
                'leaf.d.ts'
            ]);
        });

        test('maps a ".cjs" specifier to the CommonJS declaration and the plain declaration', function () {
            assert.deepStrictEqual(declarationCandidatesFor('index.d.ts', './leaf.cjs'), [
                'leaf.d.cts',
                'leaf.d.ts'
            ]);
        });

        test('lists extension and index variants for an extensionless specifier', function () {
            assert.deepStrictEqual(declarationCandidatesFor('index.d.ts', './leaf'), [
                'leaf',
                'leaf.d.ts',
                'leaf.d.mts',
                'leaf.d.cts',
                'leaf/index.d.ts',
                'leaf/index.d.mts',
                'leaf/index.d.cts'
            ]);
        });

        test('resolves specifiers relative to the folder of the importing declaration', function () {
            assert.deepStrictEqual(
                declarationCandidatesFor('nested/folder/index.d.ts', './leaf.js'),
                [ 'nested/folder/leaf.d.ts' ]
            );
        });

        test('resolves parent-relative specifiers against the importing folder', function () {
            assert.deepStrictEqual(
                declarationCandidatesFor('nested/folder/index.d.ts', '../leaf.js'),
                [ 'nested/leaf.d.ts' ]
            );
        });
    });
});
