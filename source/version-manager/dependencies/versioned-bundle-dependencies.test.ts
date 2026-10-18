import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { ExternalDependency } from '../../dependency-scanner/external-dependencies.ts';
import { distributeDependencies } from './versioned-bundle-dependencies.ts';

function externalDependency(name: string): ExternalDependency {
    return { name, referencedFrom: [ '/source/a.ts' ] };
}

suite('versioned-bundle-dependencies', function () {
    test('distributeDependencies returns empty groups when bundle and main package.json contribute nothing', function () {
        assert.deepStrictEqual(
            distributeDependencies({
                bundle: { externalDependencies: new Map(), linkedBundleDependencies: new Map() },
                mainPackageManifest: { type: 'module' },
                bundleDependencies: [],
                bundlePeerDependencies: [],
                allowMutableSpecifiers: []
            }),
            { dependencies: {}, peerDependencies: {} }
        );
    });

    test('distributeDependencies merges bundle-linked and external dependency groups', function () {
        assert.deepStrictEqual(
            distributeDependencies({
                bundle: {
                    externalDependencies: new Map([ [ 'left-pad', externalDependency('left-pad') ] ]),
                    linkedBundleDependencies: new Map([ [ 'my-bundle-dep', externalDependency('my-bundle-dep') ] ])
                },
                mainPackageManifest: { type: 'module', dependencies: { 'left-pad': '^1.0.0' } },
                bundleDependencies: [ { name: 'my-bundle-dep', version: '2.0.0' } ],
                bundlePeerDependencies: [],
                allowMutableSpecifiers: []
            }),
            {
                dependencies: { 'left-pad': '^1.0.0', 'my-bundle-dep': '2.0.0' },
                peerDependencies: {}
            }
        );
    });
});
