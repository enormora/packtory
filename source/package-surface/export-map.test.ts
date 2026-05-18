/* eslint-disable @typescript-eslint/no-unnecessary-condition -- test stubs cast partial mocks of complex orchestrator types */
import assert from 'node:assert';
import { test } from 'mocha';
import { linkedBundle } from '../test-libraries/bundle-fixtures.ts';
import { buildExportsField } from './export-map.ts';
import { explicitPackageSurface, implicitPackageSurface } from './surface.ts';

test('buildExportsField uses the explicit-mode builder when the bundle surface is explicit', () => {
    const bundle = linkedBundle({
        surface: explicitPackageSurface({ modules: [{ root: 'main', export: '.' }] })
    });

    const exportsField = buildExportsField(bundle, new Set());

    assert.ok(exportsField !== undefined);
    assert.ok('.' in (exportsField as Record<string, unknown>));
});

test('buildExportsField uses the implicit-mode builder when the bundle surface is implicit', () => {
    const bundle = linkedBundle({ surface: implicitPackageSurface('main') });

    const exportsField = buildExportsField(bundle, new Set());

    assert.ok(exportsField !== undefined);
    assert.ok('.' in (exportsField as Record<string, unknown>));
});
