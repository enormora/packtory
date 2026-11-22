import assert from 'node:assert';
import { suite, test } from 'mocha';
import { rootWithSource } from '../test-libraries/package-surface-fixtures.ts';
import type { BundleLike } from './package-shape.ts';
import { indexPublicModules } from './package-surface-index.ts';

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
    test('maps explicit root source paths to their public module specifiers', function () {
        assert.strictEqual(
            indexPublicModules(explicitBundle).specifierByInputFilePath.get('/source/index.js'),
            'package-a/entry'
        );
    });

    test('maps implicit root source paths to their public module specifiers', function () {
        assert.strictEqual(
            indexPublicModules(implicitBundle).specifierByInputFilePath.get('/source/index.js'),
            'package-a'
        );
    });

    test('public module indexes resolve explicit specifiers', function () {
        assert.strictEqual(
            indexPublicModules(explicitBundle).inputFilePathBySpecifier.get('package-a/entry'),
            '/source/index.js'
        );
    });

    test('public module indexes resolve implicit specifiers', function () {
        assert.strictEqual(
            indexPublicModules(implicitBundle).inputFilePathBySpecifier.get('package-a'),
            '/source/index.js'
        );
    });

    test('explicit and implicit dispatch keep different public-specifier shapes', function () {
        assert.strictEqual(indexPublicModules(explicitBundle).inputFilePathBySpecifier.get('package-a'), undefined);
        assert.strictEqual(
            indexPublicModules(implicitBundle).inputFilePathBySpecifier.get('package-a/entry'),
            undefined
        );
    });
});
