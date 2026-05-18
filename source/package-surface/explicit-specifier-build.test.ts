import assert from 'node:assert';
import { suite, test } from 'mocha';
import { rootWithDeclaration, rootWithSource } from '../test-libraries/package-surface-fixtures.ts';
import { getExplicitPublicModuleSpecifier } from './explicit-specifier-build.ts';
import type { ExplicitSurface } from './package-shape.ts';

const mainOnlyBundle = { name: 'package-a', roots: { main: rootWithSource('/src/index.js', 'index.js') } };
const featureBundle = { name: 'package-a', roots: { feature: rootWithSource('/src/feature.js', 'feature.js') } };
const rootSurface: ExplicitSurface = {
    mode: 'explicit',
    packageInterface: { modules: [{ root: 'main', export: '.' }] }
};

suite('explicit-specifier-build', function () {
    test('returns the bare package name when the source path maps to the "." export key', function () {
        assert.strictEqual(getExplicitPublicModuleSpecifier(mainOnlyBundle, rootSurface, '/src/index.js'), 'package-a');
    });

    test('returns "<name>/<subpath>" for a non-root explicit export', function () {
        const surface: ExplicitSurface = {
            mode: 'explicit',
            packageInterface: { modules: [{ root: 'feature', export: './feature' }] }
        };

        assert.strictEqual(
            getExplicitPublicModuleSpecifier(featureBundle, surface, '/src/feature.js'),
            'package-a/feature'
        );
    });

    test("matches a declaration source path against a root's declaration file", function () {
        const bundle = {
            name: 'package-a',
            roots: { main: rootWithDeclaration('/src/index.js', 'index.js', '/src/index.d.ts', 'index.d.ts') }
        };

        assert.strictEqual(getExplicitPublicModuleSpecifier(bundle, rootSurface, '/src/index.d.ts'), 'package-a');
    });

    test('returns undefined when no module entry references the source path', function () {
        assert.strictEqual(getExplicitPublicModuleSpecifier(mainOnlyBundle, rootSurface, '/src/other.js'), undefined);
    });

    test('returns undefined for explicit packages without any module exports', function () {
        const bundle = { name: 'package-a', roots: { cli: rootWithSource('/src/cli.js', 'cli.js') } };
        const surface: ExplicitSurface = {
            mode: 'explicit',
            packageInterface: { bins: [{ root: 'cli', name: 'package-a' }] }
        };

        assert.strictEqual(getExplicitPublicModuleSpecifier(bundle, surface, '/src/cli.js'), undefined);
    });

    test('prefers the shortest matching export key when several modules reference the same root', function () {
        const surface: ExplicitSurface = {
            mode: 'explicit',
            packageInterface: {
                modules: [
                    { root: 'feature', export: './feature-long' },
                    { root: 'feature', export: './a' }
                ]
            }
        };

        assert.strictEqual(getExplicitPublicModuleSpecifier(featureBundle, surface, '/src/feature.js'), 'package-a/a');
    });

    test('keeps the first match when later entries are not shorter', function () {
        const surface: ExplicitSurface = {
            mode: 'explicit',
            packageInterface: {
                modules: [
                    { root: 'feature', export: './aa' },
                    { root: 'feature', export: './bb' }
                ]
            }
        };

        assert.strictEqual(getExplicitPublicModuleSpecifier(featureBundle, surface, '/src/feature.js'), 'package-a/aa');
    });

    test('promotes "." ahead of an earlier non-dot export referencing the same root', function () {
        const surface: ExplicitSurface = {
            mode: 'explicit',
            packageInterface: {
                modules: [
                    { root: 'main', export: './index' },
                    { root: 'main', export: '.' }
                ]
            }
        };

        assert.strictEqual(getExplicitPublicModuleSpecifier(mainOnlyBundle, surface, '/src/index.js'), 'package-a');
    });

    test('keeps "." selected when a later entry references the same root with a longer key', function () {
        const surface: ExplicitSurface = {
            mode: 'explicit',
            packageInterface: {
                modules: [
                    { root: 'main', export: '.' },
                    { root: 'main', export: './later' }
                ]
            }
        };

        assert.strictEqual(getExplicitPublicModuleSpecifier(mainOnlyBundle, surface, '/src/index.js'), 'package-a');
    });
});
