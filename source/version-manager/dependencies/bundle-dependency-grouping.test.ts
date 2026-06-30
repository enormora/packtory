import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { ExternalDependency } from '../../dependency-scanner/external-dependencies.ts';
import { groupBundleDependencies } from './bundle-dependency-grouping.ts';

function externalDep(name: string): ExternalDependency {
    return { name, referencedFrom: [ '/src/a.ts' ] };
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
                { linkedBundleDependencies: new Map([ [ 'my-dep', externalDep('my-dep') ] ]) },
                [],
                [ { name: 'my-dep', version: '2.0.0' } ]
            ),
            { dependencies: { 'my-dep': '2.0.0' }, peerDependencies: {} }
        );
    });

    test('groupBundleDependencies routes a linked dep to peerDependencies when it is in bundlePeerDependencies', function () {
        assert.deepStrictEqual(
            groupBundleDependencies(
                { linkedBundleDependencies: new Map([ [ 'my-peer', externalDep('my-peer') ] ]) },
                [ { name: 'my-peer', version: '3.0.0' } ],
                []
            ),
            { dependencies: {}, peerDependencies: { 'my-peer': '3.0.0' } }
        );
    });

    test('groupBundleDependencies prefers the peer entry when a name appears in both peers and deps', function () {
        assert.deepStrictEqual(
            groupBundleDependencies(
                { linkedBundleDependencies: new Map([ [ 'shared', externalDep('shared') ] ]) },
                [ { name: 'shared', version: '3.0.0' } ],
                [ { name: 'shared', version: '2.0.0' } ]
            ),
            { dependencies: {}, peerDependencies: { shared: '3.0.0' } }
        );
    });

    test('groupBundleDependencies throws when a linked dep is in neither peers nor deps', function () {
        try {
            groupBundleDependencies(
                { linkedBundleDependencies: new Map([ [ 'unknown', externalDep('unknown') ] ]) },
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
