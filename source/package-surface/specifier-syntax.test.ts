import assert from 'node:assert';
import { suite, test } from 'mocha';
import { toPackageSpecifier } from './specifier-syntax.ts';

suite('specifier-syntax', function () {
    test('toPackageSpecifier returns the bare package name for the "." export key', function () {
        assert.strictEqual(toPackageSpecifier('package-a', '.'), 'package-a');
    });

    test('toPackageSpecifier joins a non-root export key as a subpath of the package name', function () {
        assert.strictEqual(toPackageSpecifier('package-a', './feature'), 'package-a/feature');
    });
});
