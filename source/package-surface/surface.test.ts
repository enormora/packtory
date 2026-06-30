import assert from 'node:assert';
import { suite, test } from 'mocha';
import { explicitPackageSurface, implicitPackageSurface } from './surface.ts';

suite('surface', function () {
    test('implicitPackageSurface() creates an implicit runtime surface', function () {
        const packageSurface = implicitPackageSurface('main');

        assert.deepStrictEqual(packageSurface, {
            mode: 'implicit',
            defaultModuleRoot: 'main'
        });
        assert.strictEqual(packageSurface.mode, 'implicit');
    });

    test('explicitPackageSurface() creates an explicit runtime surface', function () {
        const packageSurface = explicitPackageSurface({
            bins: [ { name: 'cli', root: 'main' } ],
            modules: [ { export: '.', root: 'main' } ]
        });

        assert.deepStrictEqual(packageSurface, {
            mode: 'explicit',
            packageInterface: {
                bins: [ { name: 'cli', root: 'main' } ],
                modules: [ { export: '.', root: 'main' } ]
            }
        });
        assert.strictEqual(packageSurface.mode, 'explicit');
    });
});
