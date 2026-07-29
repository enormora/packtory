import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PackageConfig } from '../../config/config.ts';
import type { PackageInterface } from '../../config/package-interface.ts';
import { packageConfigFixture } from '../../test-libraries/config-fixtures.ts';
import { resolveSurface } from './surface-resolution.ts';

const pkg: (overrides: Partial<PackageConfig>) => PackageConfig = packageConfigFixture;

suite('surface-resolution', function () {
    test('resolveSurface returns an implicit surface using the only root when there is a single root', function () {
        const surface = resolveSurface([ 'main' ], pkg({}));

        if (surface.mode !== 'implicit') {
            assert.fail('expected implicit surface');
        }
        assert.strictEqual(surface.defaultModuleRoot, 'main');
    });

    test('resolveSurface returns an implicit surface honouring defaultModuleRoot when multiple roots exist', function () {
        const surface = resolveSurface([ 'main', 'feature' ], pkg({ defaultModuleRoot: 'feature' }));

        if (surface.mode !== 'implicit') {
            assert.fail('expected implicit surface');
        }
        assert.strictEqual(surface.defaultModuleRoot, 'feature');
    });

    test('resolveSurface throws when multiple roots exist without a defaultModuleRoot', function () {
        try {
            resolveSurface([ 'main', 'feature' ], pkg({}));
            assert.fail('Expected resolveSurface() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'Config for package "pkg-a" is missing defaultModuleRoot');
        }
    });

    test('resolveSurface returns an explicit surface when packageInterface is provided', function () {
        const packageInterface: PackageInterface = { modules: [ { root: 'main', export: '.' } ] };
        const surface = resolveSurface(
            [ 'main' ],
            pkg({ packageInterface })
        );

        assert.strictEqual(surface.mode, 'explicit');
    });
});
