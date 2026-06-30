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
