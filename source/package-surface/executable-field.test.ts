import assert from 'node:assert';
import { suite, test } from 'mocha';
import { executableShebangRoot } from '../test-libraries/package-surface-fixtures.ts';
import { buildExecutableField, type SurfaceBundleLike } from './executable-field.ts';

const explicitCommandLineInterfaceBundle: SurfaceBundleLike = {
    name: 'package-a',
    roots: { commandLineInterface: executableShebangRoot('cli.js') },
    surface: {
        mode: 'explicit',
        packageInterface: { executables: [ { root: 'commandLineInterface', name: 'package-a-cli' } ] }
    }
};

const implicitCommandLineInterfaceBundle: SurfaceBundleLike = {
    name: 'package-a',
    roots: { commandLineInterface: executableShebangRoot('cli.js') },
    surface: { mode: 'implicit', defaultModuleRoot: 'commandLineInterface' }
};

suite('bin-field', function () {
    test('buildExecutableField dispatches to the explicit bin builder for an explicit surface', function () {
        assert.deepStrictEqual(buildExecutableField(explicitCommandLineInterfaceBundle), {
            'package-a-cli': './cli.js'
        });
    });

    test('buildExecutableField dispatches to the implicit bin builder for an implicit surface', function () {
        assert.deepStrictEqual(buildExecutableField(implicitCommandLineInterfaceBundle), { 'package-a': './cli.js' });
    });
});
