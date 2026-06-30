import assert from 'node:assert';
import path from 'node:path';
import { suite, test } from 'mocha';
import {
    ancestorInstalledDependencyPathCandidates,
    bundledInstalledDependencyPath,
    installedDependencyManifestPathIn,
    isInstalledDependencyManifestPath,
    isPackageManifestPath,
    packageManifestAbsolutePathIn,
    packageManifestFilePath,
    packageManifestPathIn
} from './package-layout.ts';

suite('package-layout', function () {
    test('packageManifestPathIn() appends the package manifest file name', function () {
        assert.strictEqual(packageManifestPathIn('/workspace/pkg'), '/workspace/pkg/package.json');
    });

    test('packageManifestAbsolutePathIn() resolves the package manifest path', function () {
        assert.strictEqual(packageManifestAbsolutePathIn('/workspace/pkg'), '/workspace/pkg/package.json');
    });

    test('installedDependencyManifestPathIn() targets a dependency manifest inside node_modules', function () {
        assert.strictEqual(
            installedDependencyManifestPathIn('/workspace/pkg', '@scope/shared'),
            '/workspace/pkg/node_modules/@scope/shared/package.json'
        );
    });

    test('bundledInstalledDependencyPath() keeps bundle paths posix-normalized', function () {
        const relativePath = [ 'dist', 'index.js' ].join(path.sep);
        assert.strictEqual(bundledInstalledDependencyPath('shared', relativePath), 'node_modules/shared/dist/index.js');
    });

    test('isPackageManifestPath() recognizes package manifests by basename', function () {
        assert.strictEqual(isPackageManifestPath(packageManifestFilePath), true);
        assert.strictEqual(isPackageManifestPath('/workspace/pkg/package.json'), true);
        assert.strictEqual(isPackageManifestPath('/workspace/pkg/manifest.json'), false);
    });

    test('isInstalledDependencyManifestPath() only recognizes dependency manifests inside node_modules', function () {
        assert.strictEqual(isInstalledDependencyManifestPath('/workspace/pkg/node_modules/shared/package.json'), true);
        assert.strictEqual(isInstalledDependencyManifestPath('/workspace/pkg/package.json'), false);
        assert.strictEqual(isInstalledDependencyManifestPath('/workspace/pkg/node_modules/shared/data.json'), false);
    });

    test('ancestorInstalledDependencyPathCandidates() searches the current folder and each ancestor once', function () {
        assert.deepStrictEqual(ancestorInstalledDependencyPathCandidates('/workspace/src/feature', 'foo/module.wasm'), [
            '/workspace/src/feature/node_modules/foo/module.wasm',
            '/workspace/src/node_modules/foo/module.wasm',
            '/workspace/node_modules/foo/module.wasm',
            '/node_modules/foo/module.wasm'
        ]);
    });

    test('ancestorInstalledDependencyPathCandidates() stops once it reaches the filesystem root', function () {
        assert.deepStrictEqual(ancestorInstalledDependencyPathCandidates('/', 'foo/module.wasm'), [
            '/node_modules/foo/module.wasm'
        ]);
    });
});
