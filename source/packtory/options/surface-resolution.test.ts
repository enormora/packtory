/* eslint-disable @typescript-eslint/consistent-type-assertions -- tests narrow PackageConfig to the fields resolveSurface actually reads */
import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PackageConfig } from '../../config/config.ts';
import { resolveSurface } from './surface-resolution.ts';

function pkg(overrides: Partial<PackageConfig>): PackageConfig {
    return { name: 'pkg-a', ...overrides } as unknown as PackageConfig;
}

suite('surface-resolution', function () {
    test('resolveSurface returns an implicit surface using the only root when there is a single root', function () {
        const surface = resolveSurface(['main'], pkg({}));

        if (surface.mode !== 'implicit') {
            assert.fail('expected implicit surface');
        }
        assert.strictEqual(surface.defaultModuleRoot, 'main');
    });

    test('resolveSurface returns an implicit surface honouring defaultModuleRoot when multiple roots exist', function () {
        const surface = resolveSurface(['main', 'feature'], pkg({ defaultModuleRoot: 'feature' }));

        if (surface.mode !== 'implicit') {
            assert.fail('expected implicit surface');
        }
        assert.strictEqual(surface.defaultModuleRoot, 'feature');
    });

    test('resolveSurface throws when multiple roots exist without a defaultModuleRoot', function () {
        try {
            resolveSurface(['main', 'feature'], pkg({}));
            assert.fail('Expected resolveSurface() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'Config for package "pkg-a" is missing defaultModuleRoot');
        }
    });

    test('resolveSurface returns an explicit surface when packageInterface is provided', function () {
        const surface = resolveSurface(
            ['main'],
            pkg({ packageInterface: { modules: [{ root: 'main', export: '.' }] } as never })
        );

        assert.strictEqual(surface.mode, 'explicit');
    });
});
