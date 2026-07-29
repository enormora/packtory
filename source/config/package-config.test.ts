import assert from 'node:assert';
import { suite, test } from 'mocha';
import { packageConfigFixture } from '../test-libraries/config-fixtures.ts';
import { getBundledDependencies } from './package-config.ts';

suite('package-config', function () {
    test('getBundledDependencies returns an empty list when both fields are absent', function () {
        const config = packageConfigFixture({ name: 'pkg' });
        assert.deepStrictEqual(getBundledDependencies(config), []);
    });

    test('getBundledDependencies returns just the bundleDependencies when only it is present', function () {
        const config = packageConfigFixture({ name: 'pkg', bundleDependencies: [ 'dep-a' ] });
        assert.deepStrictEqual(getBundledDependencies(config), [ 'dep-a' ]);
    });

    test('getBundledDependencies returns just the bundlePeerDependencies when only it is present', function () {
        const config = packageConfigFixture({ name: 'pkg', bundlePeerDependencies: [ 'peer-a' ] });
        assert.deepStrictEqual(getBundledDependencies(config), [ 'peer-a' ]);
    });

    test('getBundledDependencies concatenates bundleDependencies and bundlePeerDependencies in property order', function () {
        const config = packageConfigFixture({
            name: 'pkg',
            bundleDependencies: [ 'a' ],
            bundlePeerDependencies: [ 'b' ]
        });

        assert.deepStrictEqual(getBundledDependencies(config), [ 'a', 'b' ]);
    });
});
