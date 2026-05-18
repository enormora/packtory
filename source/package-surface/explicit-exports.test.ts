import assert from 'node:assert';
import { suite, test } from 'mocha';
import { plainRoot, rootWithDeclaration } from '../test-libraries/package-surface-fixtures.ts';
import { buildExplicitExportsField } from './explicit-exports.ts';
import type { ExplicitSurface } from './package-shape.ts';

const mainOnlyBundle = { name: 'package-a', roots: { main: plainRoot('index.js') } };
const rootSurface: ExplicitSurface = {
    mode: 'explicit',
    packageInterface: { modules: [{ root: 'main', export: '.' }] }
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
        const bundle = { name: 'package-a', roots: { main: plainRoot('index.js'), cli: plainRoot('cli.js') } };
        const surface: ExplicitSurface = {
            mode: 'explicit',
            packageInterface: {
                modules: [
                    { root: 'main', export: '.' },
                    { root: 'cli', export: './cli' }
                ]
            }
        };

        assert.deepStrictEqual(buildExplicitExportsField(bundle, surface)['./cli'], { import: './cli.js' });
    });

    test('returns an empty record when packageInterface declares only bins and no modules', function () {
        const bundle = { name: 'package-a', roots: { cli: plainRoot('cli.js') } };
        const surface: ExplicitSurface = {
            mode: 'explicit',
            packageInterface: { bins: [{ root: 'cli', name: 'package-a' }] }
        };

        assert.deepStrictEqual(buildExplicitExportsField(bundle, surface), {});
    });

    test('includes the package.json export when exportPackageJson is true', function () {
        const result = buildExplicitExportsField({ ...mainOnlyBundle, exportPackageJson: true }, rootSurface);

        assert.strictEqual(result['./package.json'], './package.json');
    });

    test('throws when an export references an unknown root', function () {
        const surface: ExplicitSurface = {
            mode: 'explicit',
            packageInterface: { modules: [{ root: 'missing', export: '.' }] }
        };

        assert.throws(() => {
            buildExplicitExportsField(mainOnlyBundle, surface);
        }, /^Error: Package "package-a" references unknown root "missing"$/u);
    });
});
