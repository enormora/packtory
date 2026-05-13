import assert from 'node:assert';
import { test } from 'mocha';
import {
    explicitPackageSurface,
    implicitPackageSurface,
    isExplicitPackageSurface,
    isImplicitPackageSurface
} from './surface.ts';

test('implicitPackageSurface() creates an implicit runtime surface', () => {
    const packageSurface = implicitPackageSurface('main');

    assert.deepStrictEqual(packageSurface, {
        mode: 'implicit',
        defaultModuleRoot: 'main'
    });
    assert.strictEqual(isImplicitPackageSurface(packageSurface), true);
    assert.strictEqual(isExplicitPackageSurface(packageSurface), false);
});

test('explicitPackageSurface() creates an explicit runtime surface', () => {
    const packageSurface = explicitPackageSurface({
        bins: [{ name: 'cli', root: 'main' }],
        modules: [{ export: '.', root: 'main' }]
    });

    assert.deepStrictEqual(packageSurface, {
        mode: 'explicit',
        packageInterface: {
            bins: [{ name: 'cli', root: 'main' }],
            modules: [{ export: '.', root: 'main' }]
        }
    });
    assert.strictEqual(isExplicitPackageSurface(packageSurface), true);
    assert.strictEqual(isImplicitPackageSurface(packageSurface), false);
});
