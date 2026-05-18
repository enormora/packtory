import assert from 'node:assert';
import { suite, test } from 'mocha';
import { rootWithSource } from '../test-libraries/package-surface-fixtures.ts';
import type { ExplicitSurface } from './package-shape.ts';
import { resolveExplicitPublicModuleSourceFilePath } from './explicit-specifier-resolve.ts';

const mainOnlyBundle = { name: 'package-a', roots: { main: rootWithSource('/src/index.js', 'index.js') } };
const featureBundle = { name: 'package-a', roots: { feature: rootWithSource('/src/feature.js', 'feature.js') } };
const cliBundle = { name: 'package-a', roots: { cli: rootWithSource('/src/cli.js', 'cli.js') } };
const rootSurface: ExplicitSurface = {
    mode: 'explicit',
    packageInterface: { modules: [{ root: 'main', export: '.' }] }
};
const featureSurface: ExplicitSurface = {
    mode: 'explicit',
    packageInterface: { modules: [{ root: 'feature', export: './feature' }] }
};

suite('explicit-specifier-resolve', function () {
    test('resolves the package name to its "." module\'s js source path', function () {
        assert.strictEqual(
            resolveExplicitPublicModuleSourceFilePath(mainOnlyBundle, rootSurface, 'package-a'),
            '/src/index.js'
        );
    });

    test('resolves a "<name>/<subpath>" specifier to the matching module\'s js source path', function () {
        assert.strictEqual(
            resolveExplicitPublicModuleSourceFilePath(featureBundle, featureSurface, 'package-a/feature'),
            '/src/feature.js'
        );
    });

    test('returns undefined for a foreign package specifier', function () {
        assert.strictEqual(
            resolveExplicitPublicModuleSourceFilePath(featureBundle, featureSurface, 'other-package/feature'),
            undefined
        );
    });

    test('returns undefined when the export key does not match any module', function () {
        assert.strictEqual(
            resolveExplicitPublicModuleSourceFilePath(mainOnlyBundle, rootSurface, 'package-a/missing'),
            undefined
        );
    });

    test('returns undefined when the packageInterface has no modules at all', function () {
        const binOnly: ExplicitSurface = {
            mode: 'explicit',
            packageInterface: { bins: [{ root: 'cli', name: 'package-a' }] }
        };

        assert.strictEqual(resolveExplicitPublicModuleSourceFilePath(cliBundle, binOnly, 'package-a'), undefined);
    });

    test('ignores malformed module entries when the specifier is for another package', function () {
        const malformed: ExplicitSurface = {
            mode: 'explicit',
            packageInterface: { modules: [{ root: 'feature', export: undefined as never }] }
        };

        assert.strictEqual(
            resolveExplicitPublicModuleSourceFilePath(featureBundle, malformed, 'other-package'),
            undefined
        );
    });
});
