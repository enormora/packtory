import assert from 'node:assert';
import path from 'node:path';
import { suite, test } from 'mocha';
import {
    ancestorInstalledDependencyPathCandidates,
    bundledInstalledDependencyPath,
    installedDependencyManifestPathIn,
    installedPackageFilePath,
    isInstalledDependencyManifestPath,
    isPackageManifestPath,
    packageManifestAbsolutePathIn,
    packageManifestFilePath,
    packageManifestPathIn
} from './package-layout.ts';

suite('package-layout', function () {
    test('packageManifestPathIn() appends the package manifest file name', function () {
        assert.strictEqual(packageManifestPathIn('/workspace/package'), '/workspace/package/package.json');
    });

    test('packageManifestAbsolutePathIn() resolves the package manifest path', function () {
        assert.strictEqual(packageManifestAbsolutePathIn('/workspace/package'), '/workspace/package/package.json');
    });

    test('installedDependencyManifestPathIn() targets a dependency manifest inside node_modules', function () {
        assert.strictEqual(
            installedDependencyManifestPathIn('/workspace/package', '@scope/shared'),
            '/workspace/package/node_modules/@scope/shared/package.json'
        );
    });

    test('bundledInstalledDependencyPath() keeps bundle paths posix-normalized', function () {
        const relativePath = [ 'dist', 'index.js' ].join(path.sep);
        assert.strictEqual(bundledInstalledDependencyPath('shared', relativePath), 'node_modules/shared/dist/index.js');
    });

    suite('installed package file paths', function () {
        test('installedPackageFilePath() places a package file below the installed package folder', function () {
            assert.strictEqual(
                installedPackageFilePath('shared', 'dist/index.d.ts'),
                '/node_modules/shared/dist/index.d.ts'
            );
            assert.strictEqual(
                installedPackageFilePath('@scope/shared', 'package.json'),
                '/node_modules/@scope/shared/package.json'
            );
        });
    });

    test('isPackageManifestPath() recognizes package manifests by basename', function () {
        assert.strictEqual(isPackageManifestPath(packageManifestFilePath), true);
        assert.strictEqual(isPackageManifestPath('/workspace/package/package.json'), true);
        assert.strictEqual(isPackageManifestPath('/workspace/package/manifest.json'), false);
    });

    test('isInstalledDependencyManifestPath() only recognizes dependency manifests inside node_modules', function () {
        assert.strictEqual(
            isInstalledDependencyManifestPath('/workspace/package/node_modules/shared/package.json'),
            true
        );
        assert.strictEqual(isInstalledDependencyManifestPath('/workspace/package/package.json'), false);
        assert.strictEqual(
            isInstalledDependencyManifestPath('/workspace/package/node_modules/shared/data.json'),
            false
        );
    });

    test('ancestorInstalledDependencyPathCandidates() searches the current folder and each ancestor once', function () {
        assert.deepStrictEqual(
            ancestorInstalledDependencyPathCandidates('/workspace/source/feature', 'foo/module.wasm'),
            [
                '/workspace/source/feature/node_modules/foo/module.wasm',
                '/workspace/source/node_modules/foo/module.wasm',
                '/workspace/node_modules/foo/module.wasm',
                '/node_modules/foo/module.wasm'
            ]
        );
    });

    test('ancestorInstalledDependencyPathCandidates() stops once it reaches the filesystem root', function () {
        assert.deepStrictEqual(ancestorInstalledDependencyPathCandidates('/', 'foo/module.wasm'), [
            '/node_modules/foo/module.wasm'
        ]);
    });
});
