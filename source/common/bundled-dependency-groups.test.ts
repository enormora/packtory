import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    bundledDependenciesFrom,
    bundledDependencyGroup,
    bundledDependencyGroups,
    bundledDependencyLookupOrder
} from './bundled-dependency-groups.ts';

suite('bundled-dependency-groups', function () {
    test('bundledDependenciesFrom() concatenates direct and peer groups in config order', function () {
        assert.deepStrictEqual(
            bundledDependenciesFrom({
                bundleDependencies: ['bundle-a'],
                bundlePeerDependencies: ['peer-a']
            }),
            ['bundle-a', 'peer-a']
        );
    });

    test('group descriptors preserve config order and lookup priority', function () {
        assert.deepStrictEqual(bundledDependencyGroups(), [bundledDependencyGroup.bundle, bundledDependencyGroup.peer]);
        assert.deepStrictEqual(bundledDependencyLookupOrder(), [
            bundledDependencyGroup.peer,
            bundledDependencyGroup.bundle
        ]);
    });
});
