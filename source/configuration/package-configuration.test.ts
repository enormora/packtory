import assert from 'node:assert';
import { suite, test } from 'mocha';
import { packageConfigurationFixture } from '../test-libraries/configuration-fixtures.ts';
import { getBundledDependencies } from './package-configuration.ts';

suite('package-config', function () {
    test('getBundledDependencies returns an empty list when both fields are absent', function () {
        const configuration = packageConfigurationFixture({ name: 'package' });
        assert.deepStrictEqual(getBundledDependencies(configuration), []);
    });

    test('getBundledDependencies returns just the bundleDependencies when only it is present', function () {
        const configuration = packageConfigurationFixture({ name: 'package', bundleDependencies: [ 'dependency-a' ] });
        assert.deepStrictEqual(getBundledDependencies(configuration), [ 'dependency-a' ]);
    });

    test('getBundledDependencies returns just the bundlePeerDependencies when only it is present', function () {
        const configuration = packageConfigurationFixture({ name: 'package', bundlePeerDependencies: [ 'peer-a' ] });
        assert.deepStrictEqual(getBundledDependencies(configuration), [ 'peer-a' ]);
    });

    test('getBundledDependencies concatenates bundleDependencies and bundlePeerDependencies in property order', function () {
        const configuration = packageConfigurationFixture({
            name: 'package',
            bundleDependencies: [ 'a' ],
            bundlePeerDependencies: [ 'b' ]
        });

        assert.deepStrictEqual(getBundledDependencies(configuration), [ 'a', 'b' ]);
    });
});
