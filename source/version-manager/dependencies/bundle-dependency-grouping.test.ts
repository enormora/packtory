import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { ExternalDependency } from '../../dependency-scanner/external-dependencies.ts';
import { groupBundleDependencies } from './bundle-dependency-grouping.ts';

function externalDependency(name: string): ExternalDependency {
    return { name, referencedFrom: [ '/source/a.ts' ] };
}

suite('bundle-dependency-grouping', function () {
    test('groupBundleDependencies returns empty groups when the bundle has no linked dependencies', function () {
        assert.deepStrictEqual(groupBundleDependencies({ linkedBundleDependencies: new Map() }, [], []), {
            dependencies: {},
            peerDependencies: {}
        });
    });

    test('groupBundleDependencies routes a linked dep to dependencies when it is in bundleDependencies', function () {
        assert.deepStrictEqual(
            groupBundleDependencies(
                { linkedBundleDependencies: new Map([ [ 'my-dep', externalDependency('my-dep') ] ]) },
                [],
                [ { name: 'my-dep', version: '2.0.0' } ]
            ),
            { dependencies: { 'my-dep': '2.0.0' }, peerDependencies: {} }
        );
    });

    test('groupBundleDependencies routes a linked dep to peerDependencies when it is in bundlePeerDependencies', function () {
        assert.deepStrictEqual(
            groupBundleDependencies(
                { linkedBundleDependencies: new Map([ [ 'my-peer', externalDependency('my-peer') ] ]) },
                [ { name: 'my-peer', version: '3.0.0' } ],
                []
            ),
            { dependencies: {}, peerDependencies: { 'my-peer': '3.0.0' } }
        );
    });

    test('groupBundleDependencies prefers the peer entry when a name appears in both peers and dependencies', function () {
        assert.deepStrictEqual(
            groupBundleDependencies(
                { linkedBundleDependencies: new Map([ [ 'shared', externalDependency('shared') ] ]) },
                [ { name: 'shared', version: '3.0.0' } ],
                [ { name: 'shared', version: '2.0.0' } ]
            ),
            { dependencies: {}, peerDependencies: { shared: '3.0.0' } }
        );
    });

    test('groupBundleDependencies throws when a linked dep is in neither peers nor dependencies', function () {
        try {
            groupBundleDependencies(
                { linkedBundleDependencies: new Map([ [ 'unknown', externalDependency('unknown') ] ]) },
                [],
                []
            );
            assert.fail('Expected groupBundleDependencies() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual(
                (error as Error).message,
                'Couldn’t determine version number of bundle dependency unknown'
            );
        }
    });
});
