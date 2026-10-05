import path from 'node:path';
import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { MainPackageJson } from '../../source/config/package-json.ts';
import { packageProcessor } from '../../source/packages/package-processor/package-processor.entry-point.ts';
import type { VersionedBundleWithManifest } from '../../source/version-manager/versioned-bundle.ts';

async function buildRuntimePackage(
    rootFileName: string,
    mainPackageJson: MainPackageJson,
    deadCodeEliminationEnabled: boolean
): Promise<VersionedBundleWithManifest> {
    const sourcesFolder = path.join(process.cwd(), 'integration-tests/fixtures/runtime-extension-dependencies/src');
    return packageProcessor.build({
        name: 'runtime-package',
        version: '1.0.0',
        sourcesFolder,
        roots: { main: { js: path.join(sourcesFolder, rootFileName) } },
        mainPackageJson,
        includeSourceMapFiles: false,
        additionalFiles: [],
        bundleDependencies: [],
        bundlePeerDependencies: [],
        additionalPackageJsonAttributes: {},
        allowMutableSpecifiers: [],
        deadCodeElimination: { enabled: deadCodeEliminationEnabled }
    });
}

suite('runtime extension dependencies', function () {
    for (const extension of [ 'js', 'mjs', 'cjs' ]) {
        for (const enabled of [ false, true ]) {
            suite(`.${extension} with DCE ${enabled ? 'enabled' : 'disabled'}`, function () {
                test('rejects an installed dependency missing from the configured manifest', async function () {
                    await assert.rejects(buildRuntimePackage(`entry.${extension}`, { type: 'module' }, enabled), {
                        message: 'Couldn’t determine version number of tslib, because it is not listed in the main ' +
                            'package.json'
                    });
                });

                test('rejects an installed dependency declared only in devDependencies', async function () {
                    await assert.rejects(
                        buildRuntimePackage(`entry.${extension}`, {
                            type: 'module',
                            devDependencies: { tslib: '2.8.1' }
                        }, enabled),
                        {
                            message:
                                'Couldn’t determine version number of tslib, because it is not listed in the main ' +
                                'package.json'
                        }
                    );
                });

                test('emits a declared direct dependency and preserves its live reference', async function () {
                    const bundle = await buildRuntimePackage(`entry.${extension}`, {
                        type: 'module',
                        dependencies: { tslib: '2.8.1' }
                    }, enabled);

                    assert.deepStrictEqual({
                        dependencies: bundle.dependencies,
                        peerDependencies: bundle.peerDependencies
                    }, { dependencies: { tslib: '2.8.1' }, peerDependencies: {} });
                    assert.match(bundle.mainFile.content, /tslib/);
                });

                test('emits a declared peer dependency and preserves its live reference', async function () {
                    const bundle = await buildRuntimePackage(`entry.${extension}`, {
                        type: 'module',
                        peerDependencies: { tslib: '2.8.1' }
                    }, enabled);

                    assert.deepStrictEqual({
                        dependencies: bundle.dependencies,
                        peerDependencies: bundle.peerDependencies
                    }, { dependencies: {}, peerDependencies: { tslib: '2.8.1' } });
                    assert.match(bundle.mainFile.content, /tslib/);
                });
            });
        }
    }

    test('rejects an undeclared dependency reached through a mixed-extension graph', async function () {
        await assert.rejects(buildRuntimePackage('mixed.mjs', { type: 'module' }, true), {
            message: 'Couldn’t determine version number of tslib, because it is not listed in the main package.json'
        });
    });

    test('includes local CommonJS files and their dependencies beneath an ESM root', async function () {
        const bundle = await buildRuntimePackage('mixed.mjs', {
            type: 'module',
            dependencies: { tslib: '2.8.1' }
        }, true);

        assert.deepStrictEqual(bundle.dependencies, { tslib: '2.8.1' });
        assert.deepStrictEqual(
            bundle
                .contents
                .map(function (resource) {
                    return resource.fileDescription.targetFilePath;
                })
                .toSorted(function (left, right) {
                    return left.localeCompare(right);
                }),
            [ 'entry.cjs', 'mixed.mjs' ]
        );
    });
});
