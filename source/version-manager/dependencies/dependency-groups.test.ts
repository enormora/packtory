import assert from 'node:assert';
import { suite, test } from 'mocha';
import { mergeDependencyGroups } from './dependency-groups.ts';

suite('dependency-groups', function () {
    test('mergeDependencyGroups returns empty groups when called with no arguments', function () {
        assert.deepStrictEqual(mergeDependencyGroups(), { dependencies: {}, peerDependencies: {} });
    });

    test('mergeDependencyGroups returns a single group unchanged', function () {
        assert.deepStrictEqual(
            mergeDependencyGroups({ dependencies: { a: '1.0.0' }, peerDependencies: { b: '2.0.0' } }),
            {
                dependencies: { a: '1.0.0' },
                peerDependencies: { b: '2.0.0' }
            }
        );
    });

    test('mergeDependencyGroups merges non-overlapping groups across dependencies and peerDependencies', function () {
        assert.deepStrictEqual(
            mergeDependencyGroups(
                { dependencies: { a: '1.0.0' }, peerDependencies: {} },
                { dependencies: { b: '2.0.0' }, peerDependencies: { c: '3.0.0' } }
            ),
            { dependencies: { a: '1.0.0', b: '2.0.0' }, peerDependencies: { c: '3.0.0' } }
        );
    });

    test('mergeDependencyGroups lets the later group override the earlier group for the same dependency name', function () {
        assert.deepStrictEqual(
            mergeDependencyGroups(
                { dependencies: { a: '1.0.0' }, peerDependencies: {} },
                { dependencies: { a: '2.0.0' }, peerDependencies: {} }
            ),
            { dependencies: { a: '2.0.0' }, peerDependencies: {} }
        );
    });
});
