import assert from 'node:assert';
import { suite, test } from 'mocha';
import { plainRoot, rootWithDeclaration } from '../test-libraries/package-surface-fixtures.ts';
import { buildExplicitExportsField } from './explicit-exports.ts';
import type { ExplicitSurface } from './package-shape.ts';

const mainOnlyBundle = { name: 'package-a', roots: { main: plainRoot('index.js') } };
const rootSurface: ExplicitSurface = {
    mode: 'explicit',
    packageInterface: { modules: [ { root: 'main', export: '.' } ] }
};

suite('explicit-exports', function () {
    test('maps the "." export key to the root\'s import target without a types entry', function () {
        assert.deepStrictEqual(buildExplicitExportsField(mainOnlyBundle, rootSurface)['.'], { import: './index.js' });
    });

    test('adds a types entry when the root has a declaration file', function () {
        const bundle = {
            name: 'package-a',
            roots: { main: rootWithDeclaration('', 'index.js', '', 'index.d.ts') }
        };

        assert.deepStrictEqual(buildExplicitExportsField(bundle, rootSurface)['.'], {
            import: './index.js',
            types: './index.d.ts'
        });
    });

    test("maps a subpath export to its root's import target", function () {
        const bundle = {
            name: 'package-a',
            roots: { main: plainRoot('index.js'), commandLineInterface: plainRoot('cli.js') }
        };
        const surface: ExplicitSurface = {
            mode: 'explicit',
            packageInterface: {
                modules: [
                    { root: 'main', export: '.' },
                    { root: 'commandLineInterface', export: './cli' }
                ]
            }
        };

        assert.deepStrictEqual(buildExplicitExportsField(bundle, surface)['./cli'], { import: './cli.js' });
    });

    test('returns an empty record when packageInterface declares only executables and no modules', function () {
        const bundle = { name: 'package-a', roots: { commandLineInterface: plainRoot('cli.js') } };
        const surface: ExplicitSurface = {
            mode: 'explicit',
            packageInterface: { executables: [ { root: 'commandLineInterface', name: 'package-a' } ] }
        };

        assert.deepStrictEqual(buildExplicitExportsField(bundle, surface), {});
    });

    test('returns an empty record when an explicit surface declares no entries', function () {
        const surface: ExplicitSurface = {
            mode: 'explicit',
            packageInterface: {}
        };

        assert.deepStrictEqual(buildExplicitExportsField(mainOnlyBundle, surface), {});
    });

    test('emits a type-only root export when a bin-only package root has a declaration file', function () {
        const bundle = {
            name: 'package-a',
            roots: { commandLineInterface: rootWithDeclaration('', 'cli.js', '', 'cli.d.ts') }
        };
        const surface: ExplicitSurface = {
            mode: 'explicit',
            packageInterface: { executables: [ { root: 'commandLineInterface', name: 'package-a' } ] }
        };

        assert.deepStrictEqual(buildExplicitExportsField(bundle, surface), { '.': { types: './cli.d.ts' } });
    });

    test('includes the package.json export when exportPackageManifest is true', function () {
        const result = buildExplicitExportsField({ ...mainOnlyBundle, exportPackageManifest: true }, rootSurface);

        assert.strictEqual(result['./package.json'], './package.json');
    });

    test('throws when an export references an unknown root', function () {
        const surface: ExplicitSurface = {
            mode: 'explicit',
            packageInterface: { modules: [ { root: 'missing', export: '.' } ] }
        };

        assert.throws(function () {
            buildExplicitExportsField(mainOnlyBundle, surface);
        }, /^Error: Package "package-a" references unknown root "missing"$/u);
    });
});
