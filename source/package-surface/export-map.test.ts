import assert from 'node:assert';
import { suite, test } from 'mocha';
import { linkedBundle } from '../test-libraries/bundle-fixtures.ts';
import { buildExportsField } from './export-map.ts';
import { explicitPackageSurface, implicitPackageSurface } from './surface.ts';

function assertExportsEntryExists(exportsField: unknown, exportPath: string): void {
    if (typeof exportsField !== 'object' || exportsField === null) {
        assert.fail('expected an exports object');
    }
    assert.strictEqual(Object.hasOwn(exportsField, exportPath), true);
}

suite('export-map', function () {
    test('file-only packages export each file directly without a JavaScript entry point', function () {
        const bundle = {
            name: 'configs',
            roots: {},
            surface: { mode: 'files' } as const,
            contents: [
                { fileDescription: { inputFilePath: '/source/base.json', targetFilePath: 'tsconfig.json' } },
                { fileDescription: { inputFilePath: '/source/node.json', targetFilePath: 'presets/node.json' } },
                { fileDescription: { inputFilePath: '/source/readme.md', targetFilePath: 'readme.md' } }
            ]
        };
        assert.deepStrictEqual(buildExportsField(bundle, new Set()), {
            './tsconfig.json': './tsconfig.json',
            './presets/node.json': './presets/node.json',
            './readme.md': './readme.md'
        });
        assert.deepStrictEqual(buildExportsField({ ...bundle, exportPackageManifest: true }, new Set()), {
            './tsconfig.json': './tsconfig.json',
            './presets/node.json': './presets/node.json',
            './readme.md': './readme.md',
            './package.json': './package.json'
        });
    });

    test('buildExportsField uses the explicit-mode builder when the bundle surface is explicit', function () {
        const bundle = linkedBundle({
            surface: explicitPackageSurface({ modules: [ { root: 'main', export: '.' } ] })
        });

        const exportsField = buildExportsField(bundle, new Set());

        assertExportsEntryExists(exportsField, '.');
    });

    test('buildExportsField uses the implicit-mode builder when the bundle surface is implicit', function () {
        const bundle = linkedBundle({ surface: implicitPackageSurface('main') });

        const exportsField = buildExportsField(bundle, new Set());

        assertExportsEntryExists(exportsField, '.');
    });
});
