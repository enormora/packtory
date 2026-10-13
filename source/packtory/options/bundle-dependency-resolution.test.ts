import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PackageConfiguration } from '../../configuration/configuration.ts';
import { packageConfigurationFixture } from '../../test-libraries/configuration-fixtures.ts';
import {
    resolveBundleDependencies,
    resolveBundleDependencyClosure
} from './bundle-dependency-resolution.ts';

const packageConfiguration: (overrides: Partial<PackageConfiguration>) => PackageConfiguration =
    packageConfigurationFixture;

suite('bundle-dependency-resolution', function () {
    test('resolveBundleDependencies returns empty lists when the package has no declared dependencies', function () {
        assert.deepStrictEqual(resolveBundleDependencies(packageConfiguration({}), []), {
            bundleDependencies: [],
            bundlePeerDependencies: []
        });
    });

    test('resolveBundleDependencies maps each declared dependency name to the matching bundle', function () {
        const bundleA = { name: 'package-b', payload: 'b' };
        const bundleB = { name: 'package-c', payload: 'c' };

        const result = resolveBundleDependencies(
            packageConfiguration({ bundleDependencies: [ 'package-b', 'package-c' ] }),
            [
                bundleA,
                bundleB
            ]
        );

        assert.deepStrictEqual(result.bundleDependencies, [ bundleA, bundleB ]);
    });

    test('resolveBundleDependencies maps each declared peer dependency name to the matching bundle', function () {
        const peer = { name: 'package-peer', payload: 'p' };

        const result = resolveBundleDependencies(packageConfiguration({ bundlePeerDependencies: [ 'package-peer' ] }), [
            peer
        ]);

        assert.deepStrictEqual(result.bundlePeerDependencies, [ peer ]);
    });

    test('resolveBundleDependencies throws when a declared dependency has no matching bundle', function () {
        try {
            resolveBundleDependencies(packageConfiguration({ bundleDependencies: [ 'missing' ] }), []);
            assert.fail('Expected resolveBundleDependencies() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'Dependent bundle "missing" not found');
        }
    });

    test('resolveBundleDependencyClosure maps direct and transitive dependencies once', function () {
        const bundleB = { name: 'package-b', payload: 'b' };
        const bundleC = { name: 'package-c', payload: 'c' };
        const packageA = packageConfiguration({
            name: 'package-a',
            bundleDependencies: [ 'package-b' ],
            bundlePeerDependencies: [ 'package-c' ]
        });
        const packageB = packageConfiguration({ name: 'package-b', bundleDependencies: [ 'package-c' ] });
        const packageC = packageConfiguration({ name: 'package-c' });

        const result = resolveBundleDependencyClosure(
            packageA,
            { 'package-a': packageA, 'package-b': packageB, 'package-c': packageC },
            [ bundleB, bundleC ]
        );

        assert.deepStrictEqual(result, [ bundleB, bundleC ]);
    });

    test('resolveBundleDependencyClosure throws when a reachable package config is missing', function () {
        const packageA = packageConfiguration({ name: 'package-a', bundleDependencies: [ 'package-b' ] });

        assert.throws(function () {
            resolveBundleDependencyClosure(packageA, { 'package-a': packageA }, [ { name: 'package-b' } ]);
        }, { message: 'Config for package "package-b" is missing' });
    });

    test('resolveBundleDependencyClosure excludes the root package from cyclic input', function () {
        const bundleB = { name: 'package-b' };
        const packageA = packageConfiguration({ name: 'package-a', bundleDependencies: [ 'package-b' ] });
        const packageB = packageConfiguration({ name: 'package-b', bundleDependencies: [ 'package-a' ] });

        assert.deepStrictEqual(
            resolveBundleDependencyClosure(packageA, { 'package-a': packageA, 'package-b': packageB }, [ bundleB ]),
            [ bundleB ]
        );
    });
});
