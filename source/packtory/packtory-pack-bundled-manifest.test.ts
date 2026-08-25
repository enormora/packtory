import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Result } from 'true-myth';
import {
    buildDependenciesWith,
    makeResolvedPackage,
    runVendorAndExpectExtraFiles,
    sortedFilePaths,
    type FakeVersionedBundle
} from '../test-libraries/packtory-pack-test-support.ts';
import { createRunPackValidated } from './packtory-pack.ts';

type VersionInput = {
    readonly bundle: {
        readonly name: string;
    };
};

const versionedTarget = {
    name: 'pkg-a',
    version: '0.0.0',
    manifestFile: { content: '{}', isExecutable: false, filePath: 'package.json' },
    contents: [],
    peerDependencies: {}
};

const versionedDependency: FakeVersionedBundle = {
    name: 'dep',
    version: '0.0.0',
    manifestFile: { content: '{"name":"dep"}', isExecutable: false, filePath: 'package.json' },
    contents: [
        {
            isGeneratedManifest: true,
            fileDescription: {
                targetFilePath: 'package.json',
                content: '{"name":"dep"}',
                isExecutable: false
            }
        },
        {
            fileDescription: {
                targetFilePath: 'index.js',
                content: 'export {};',
                isExecutable: false
            }
        }
    ],
    peerDependencies: {}
};

suite('packtory-pack bundled dependency manifests', function () {
    test('does not duplicate a bundled dependency generated package.json when contents include it', async function () {
        const addVersion = fake(function (options: VersionInput) {
            return options.bundle.name === 'dep' ? versionedDependency : versionedTarget;
        });
        const packEmitterPack = fake.resolves(undefined);
        const resolveAndLinkAll = fake.resolves(Result.ok([
            makeResolvedPackage({ bundleDependencyNames: [ 'dep' ] }),
            makeResolvedPackage({ name: 'dep' })
        ]));
        const runPack = createRunPackValidated(buildDependenciesWith(addVersion, packEmitterPack));

        const extraFiles = await runVendorAndExpectExtraFiles(
            runPack,
            resolveAndLinkAll,
            packEmitterPack
        );

        assert.deepStrictEqual(sortedFilePaths(extraFiles), [
            'node_modules/dep/index.js',
            'node_modules/dep/package.json'
        ]);
    });
});
