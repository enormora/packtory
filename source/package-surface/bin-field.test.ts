import assert from 'node:assert';
import { test } from 'mocha';
import { executableShebangRoot } from '../test-libraries/package-surface-fixtures.ts';
import { buildBinField, type SurfaceBundleLike } from './bin-field.ts';

const explicitCliBundle: SurfaceBundleLike = {
    name: 'package-a',
    roots: { cli: executableShebangRoot('cli.js') },
    surface: {
        mode: 'explicit',
        packageInterface: { bins: [{ root: 'cli', name: 'pkg-a-cli' }] }
    }
};

const implicitCliBundle: SurfaceBundleLike = {
    name: 'package-a',
    roots: { cli: executableShebangRoot('cli.js') },
    surface: { mode: 'implicit', defaultModuleRoot: 'cli' }
};

test('buildBinField dispatches to the explicit bin builder for an explicit surface', () => {
    assert.deepStrictEqual(buildBinField(explicitCliBundle), { 'pkg-a-cli': './cli.js' });
});

test('buildBinField dispatches to the implicit bin builder for an implicit surface', () => {
    assert.deepStrictEqual(buildBinField(implicitCliBundle), { 'package-a': './cli.js' });
});
