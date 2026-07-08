import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { assertDeepSubset } from '../test-libraries/deep-subset-assertion.ts';
import { versionedBundleWithManifest } from '../test-libraries/bundle-fixtures.ts';
import { createFakeFileManager, type FakeFileManager } from '../test-libraries/fake-file-manager.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import { createPackEmitter, type PackEmitterDependencies } from './pack-emitter.ts';

type PackEmitterFixture = {
    readonly deps: PackEmitterDependencies;
    readonly fileManager: FakeFileManager;
};

function makeBundle(): VersionedBundleWithManifest {
    return versionedBundleWithManifest({
        contents: [],
        packageJson: { name: 'the-pkg', version: '1.0.0' },
        name: 'the-pkg',
        manifestFile: { content: '{}', isExecutable: false, filePath: 'package.json' }
    });
}

function createDependencies(overrides: Partial<PackEmitterDependencies['artifactsBuilder']> = {}): PackEmitterFixture {
    const fileManager = createFakeFileManager();
    const artifactsBuilder = {
        buildZip: overrides.buildZip ?? fake.resolves({ zipData: Buffer.from([ 80, 75 ]) }),
        buildTarball: overrides.buildTarball ?? fake.resolves({ tarData: Buffer.from([ 31, 139 ]) }),
        buildFolder: overrides.buildFolder ?? fake.resolves(undefined)
    };
    return {
        deps: { artifactsBuilder, fileManager },
        fileManager
    };
}

suite('pack-emitter', function () {
    test('writes the zip artifact bytes returned by buildZip to the output path', async function () {
        const zipData = Buffer.from([ 80, 75, 5, 6 ]);
        const buildZip = fake.resolves({ zipData });
        const { deps, fileManager } = createDependencies({ buildZip });
        const emitter = createPackEmitter(deps);
        const bundle = makeBundle();

        await emitter.pack({ bundle, format: 'zip', outputPath: '/out/fn.zip', vendorEntries: [], extraFiles: [] });

        assertDeepSubset(buildZip, {
            callCount: 1,
            firstCall: {
                args: [ bundle, [], [] ]
            }
        });
        assert.strictEqual(fileManager.getWriteBinaryFileCallCount(), 1);
        assert.deepStrictEqual(fileManager.getWriteBinaryFileCall(0), {
            filePath: '/out/fn.zip',
            content: zipData
        });
    });

    test('writes the tarball artifact bytes returned by buildTarball to the output path', async function () {
        const tarData = Buffer.from([ 31, 139, 8, 0 ]);
        const buildTarball = fake.resolves({ tarData });
        const { deps, fileManager } = createDependencies({ buildTarball });
        const emitter = createPackEmitter(deps);
        const bundle = makeBundle();

        await emitter.pack({ bundle, format: 'tar', outputPath: '/out/pkg.tgz', vendorEntries: [], extraFiles: [] });

        assertDeepSubset(buildTarball, {
            callCount: 1,
            firstCall: {
                args: [ bundle, [], [] ]
            }
        });
        assert.strictEqual(fileManager.getWriteBinaryFileCallCount(), 1);
        assert.deepStrictEqual(fileManager.getWriteBinaryFileCall(0), {
            filePath: '/out/pkg.tgz',
            content: tarData
        });
    });

    test('delegates folder writes to buildFolder with the requested output path', async function () {
        const buildFolder = fake.resolves(undefined);
        const { deps, fileManager } = createDependencies({ buildFolder });
        const emitter = createPackEmitter(deps);
        const bundle = makeBundle();

        await emitter.pack({
            bundle,
            format: 'folder',
            outputPath: '/out/extracted',
            vendorEntries: [],
            extraFiles: []
        });

        assertDeepSubset(buildFolder, {
            callCount: 1,
            firstCall: {
                args: [ bundle, '/out/extracted', [], [] ]
            }
        });
        assert.strictEqual(fileManager.getWriteBinaryFileCallCount(), 0);
    });
});
