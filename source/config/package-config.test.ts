/* eslint-disable @typescript-eslint/consistent-type-assertions -- test stubs cast partial mocks of complex orchestrator types */
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { getBundledDependencies, type PackageConfig } from './package-config.ts';

const stubRoots = { main: { js: 'index.js' } } as unknown as PackageConfig['roots'];

suite('package-config', function () {
    test('getBundledDependencies returns an empty list when both fields are absent', function () {
        const config = { name: 'pkg', roots: stubRoots } as PackageConfig;
        assert.deepStrictEqual(getBundledDependencies(config), []);
    });

    test('getBundledDependencies returns just the bundleDependencies when only it is present', function () {
        const config = { name: 'pkg', roots: stubRoots, bundleDependencies: ['dep-a'] } as PackageConfig;
        assert.deepStrictEqual(getBundledDependencies(config), ['dep-a']);
    });

    test('getBundledDependencies returns just the bundlePeerDependencies when only it is present', function () {
        const config = { name: 'pkg', roots: stubRoots, bundlePeerDependencies: ['peer-a'] } as PackageConfig;
        assert.deepStrictEqual(getBundledDependencies(config), ['peer-a']);
    });

    test('getBundledDependencies concatenates bundleDependencies and bundlePeerDependencies in property order', function () {
        const config = {
            name: 'pkg',
            roots: stubRoots,
            bundleDependencies: ['a'],
            bundlePeerDependencies: ['b']
        } as PackageConfig;

        assert.deepStrictEqual(getBundledDependencies(config), ['a', 'b']);
    });
});
