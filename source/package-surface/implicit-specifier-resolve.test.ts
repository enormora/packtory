import assert from 'node:assert';
import { suite, test } from 'mocha';
import { content, rootWithSource } from '../test-libraries/package-surface-fixtures.ts';
import type { ImplicitSurface } from './package-shape.ts';
import { resolveImplicitPublicModuleSourceFilePath } from './implicit-specifier-resolve.ts';

const surface: ImplicitSurface = { mode: 'implicit', defaultModuleRoot: 'main' };
const bundleWithPrivateContent = {
    name: 'package-a',
    roots: { main: rootWithSource('/src/index.js', 'index.js') },
    contents: [content('/src/private.js', 'private.js')]
};
const emptyContentBundle = {
    name: 'package-a',
    roots: { main: rootWithSource('/src/index.js', 'index.js') },
    contents: []
};

suite('implicit-specifier-resolve', function () {
    test("resolves the package name to the default root's js source path", function () {
        assert.strictEqual(
            resolveImplicitPublicModuleSourceFilePath(emptyContentBundle, surface, 'package-a'),
            '/src/index.js'
        );
    });

    test('resolves "<name>/<targetFilePath>" to the content\'s source path', function () {
        assert.strictEqual(
            resolveImplicitPublicModuleSourceFilePath(bundleWithPrivateContent, surface, 'package-a/private.js'),
            '/src/private.js'
        );
    });

    test('returns undefined for a foreign package specifier', function () {
        assert.strictEqual(
            resolveImplicitPublicModuleSourceFilePath(bundleWithPrivateContent, surface, 'other-package/private.js'),
            undefined
        );
    });

    test('returns undefined for a subpath specifier whose target is not in contents', function () {
        assert.strictEqual(
            resolveImplicitPublicModuleSourceFilePath(emptyContentBundle, surface, 'package-a/missing.js'),
            undefined
        );
    });
});
