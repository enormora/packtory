import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PackageConfig } from '../../config/config.ts';
import { packageConfigFixture } from '../../test-libraries/config-fixtures.ts';
import {
    resolveBundleDependencies,
    resolveBundleDependencyClosure
} from './bundle-dependency-resolution.ts';

const packageConfig: (overrides: Partial<PackageConfig>) => PackageConfig = packageConfigFixture;

suite('bundle-dependency-resolution', function () {
    test('resolveBundleDependencies returns empty lists when the package has no declared dependencies', function () {
        assert.deepStrictEqual(resolveBundleDependencies(packageConfig({}), []), {
            bundleDependencies: [],
            bundlePeerDependencies: []
        });
    });

    test('resolveBundleDependencies maps each declared dependency name to the matching bundle', function () {
        const bundleA = { name: 'pkg-b', payload: 'b' };
        const bundleB = { name: 'pkg-c', payload: 'c' };

        const result = resolveBundleDependencies(packageConfig({ bundleDependencies: [ 'pkg-b', 'pkg-c' ] }), [
            bundleA,
            bundleB
        ]);

        assert.deepStrictEqual(result.bundleDependencies, [ bundleA, bundleB ]);
    });

    test('resolveBundleDependencies maps each declared peer dependency name to the matching bundle', function () {
        const peer = { name: 'pkg-peer', payload: 'p' };

        const result = resolveBundleDependencies(packageConfig({ bundlePeerDependencies: [ 'pkg-peer' ] }), [ peer ]);

        assert.deepStrictEqual(result.bundlePeerDependencies, [ peer ]);
    });

    test('resolveBundleDependencies throws when a declared dependency has no matching bundle', function () {
        try {
            resolveBundleDependencies(packageConfig({ bundleDependencies: [ 'missing' ] }), []);
            assert.fail('Expected resolveBundleDependencies() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'Dependent bundle "missing" not found');
        }
    });

    test('resolveBundleDependencyClosure maps direct and transitive dependencies once', function () {
        const bundleB = { name: 'pkg-b', payload: 'b' };
        const bundleC = { name: 'pkg-c', payload: 'c' };
        const packageA = packageConfig({
            name: 'pkg-a',
            bundleDependencies: [ 'pkg-b' ],
            bundlePeerDependencies: [ 'pkg-c' ]
        });
        const packageB = packageConfig({ name: 'pkg-b', bundleDependencies: [ 'pkg-c' ] });
        const packageC = packageConfig({ name: 'pkg-c' });

        const result = resolveBundleDependencyClosure(
            packageA,
            { 'pkg-a': packageA, 'pkg-b': packageB, 'pkg-c': packageC },
            [ bundleB, bundleC ]
        );

        assert.deepStrictEqual(result, [ bundleB, bundleC ]);
    });
});
