import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PackageConfig } from '../../config/config.ts';
import { resolveBundleDependencies } from './bundle-dependency-resolution.ts';

function pkg(overrides: Partial<PackageConfig>): PackageConfig {
    return { name: 'pkg-a', ...overrides } as unknown as PackageConfig;
}

suite('bundle-dependency-resolution', function () {
    test('resolveBundleDependencies returns empty lists when the package has no declared dependencies', function () {
        assert.deepStrictEqual(resolveBundleDependencies(pkg({}), []), {
            bundleDependencies: [],
            bundlePeerDependencies: []
        });
    });

    test('resolveBundleDependencies maps each declared dependency name to the matching bundle', function () {
        const bundleA = { name: 'pkg-b', payload: 'b' };
        const bundleB = { name: 'pkg-c', payload: 'c' };

        const result = resolveBundleDependencies(pkg({ bundleDependencies: ['pkg-b', 'pkg-c'] }), [bundleA, bundleB]);

        assert.deepStrictEqual(result.bundleDependencies, [bundleA, bundleB]);
    });

    test('resolveBundleDependencies maps each declared peer dependency name to the matching bundle', function () {
        const peer = { name: 'pkg-peer', payload: 'p' };

        const result = resolveBundleDependencies(pkg({ bundlePeerDependencies: ['pkg-peer'] }), [peer]);

        assert.deepStrictEqual(result.bundlePeerDependencies, [peer]);
    });

    test('resolveBundleDependencies throws when a declared dependency has no matching bundle', function () {
        try {
            resolveBundleDependencies(pkg({ bundleDependencies: ['missing'] }), []);
            assert.fail('Expected resolveBundleDependencies() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'Dependent bundle "missing" not found');
        }
    });
});
