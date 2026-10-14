import assert from 'node:assert';
import { suite, test } from 'mocha';
import { rootWithSource } from '../test-libraries/package-surface-fixtures.ts';
import type { BundleLike } from './package-shape.ts';
import { getPublicModuleSpecifierForSourcePath, resolvePublicModuleInputFilePath } from './public-specifiers.ts';

const mainRoots = { main: rootWithSource('/source/index.js', 'index.js') };

const explicitBundle: BundleLike = {
    name: 'package-a',
    roots: mainRoots,
    contents: [],
    surface: {
        mode: 'explicit',
        packageInterface: { modules: [ { root: 'main', export: './entry' } ] }
    }
};

const implicitBundle: BundleLike = {
    name: 'package-a',
    roots: mainRoots,
    contents: [],
    surface: { mode: 'implicit', defaultModuleRoot: 'main' }
};

suite('public-specifiers', function () {
    test('getPublicModuleSpecifierForSourcePath dispatches to the explicit builder for explicit surfaces', function () {
        assert.strictEqual(
            getPublicModuleSpecifierForSourcePath(explicitBundle, '/source/index.js'),
            'package-a/entry'
        );
    });

    test('getPublicModuleSpecifierForSourcePath dispatches to the implicit builder for implicit surfaces', function () {
        assert.strictEqual(getPublicModuleSpecifierForSourcePath(implicitBundle, '/source/index.js'), 'package-a');
    });

    test('resolvePublicModuleInputFilePath dispatches to the explicit resolver for explicit surfaces', function () {
        assert.strictEqual(resolvePublicModuleInputFilePath(explicitBundle, 'package-a/entry'), '/source/index.js');
    });

    test('resolvePublicModuleInputFilePath dispatches to the implicit resolver for implicit surfaces', function () {
        assert.strictEqual(resolvePublicModuleInputFilePath(implicitBundle, 'package-a'), '/source/index.js');
    });

    test('explicit and implicit dispatch keep different public-specifier shapes', function () {
        assert.strictEqual(resolvePublicModuleInputFilePath(explicitBundle, 'package-a'), undefined);
        assert.strictEqual(resolvePublicModuleInputFilePath(implicitBundle, 'package-a/entry'), undefined);
    });
});
