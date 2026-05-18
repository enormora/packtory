import assert from 'node:assert';
import { test } from 'mocha';
import { resolveExplicitExportKey, resolveImplicitSpecifier, toPackageSpecifier } from './specifier-syntax.ts';

test('toPackageSpecifier returns the bare package name for the "." export key', () => {
    assert.strictEqual(toPackageSpecifier('package-a', '.'), 'package-a');
});

test('toPackageSpecifier joins a non-root export key as a subpath of the package name', () => {
    assert.strictEqual(toPackageSpecifier('package-a', './feature'), 'package-a/feature');
});

test('resolveExplicitExportKey returns "." for a specifier equal to the package name', () => {
    assert.strictEqual(resolveExplicitExportKey('package-a', 'package-a'), '.');
});

test('resolveExplicitExportKey returns the subpath as a "./..." key for a prefixed specifier', () => {
    assert.strictEqual(resolveExplicitExportKey('package-a', 'package-a/feature'), './feature');
});

test('resolveExplicitExportKey returns undefined for a foreign specifier', () => {
    assert.strictEqual(resolveExplicitExportKey('package-a', 'other-package'), undefined);
});

test('resolveExplicitExportKey returns undefined for a name-prefix that is not a subpath', () => {
    assert.strictEqual(resolveExplicitExportKey('package-a', 'package-anything'), undefined);
});

test('resolveImplicitSpecifier returns ["root"] for a specifier equal to the bundle name', () => {
    assert.deepStrictEqual(resolveImplicitSpecifier('package-a', 'package-a'), ['root']);
});

test('resolveImplicitSpecifier returns ["content", path] for a subpath specifier', () => {
    assert.deepStrictEqual(resolveImplicitSpecifier('package-a', 'package-a/feature.js'), ['content', 'feature.js']);
});

test('resolveImplicitSpecifier returns ["private"] for a foreign specifier', () => {
    assert.deepStrictEqual(resolveImplicitSpecifier('package-a', 'other-package/feature.js'), ['private']);
});
