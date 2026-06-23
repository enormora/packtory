/* eslint-disable @typescript-eslint/consistent-type-assertions -- test stubs cast partial mocks of complex orchestrator types */
import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { BundleEmitter } from '../bundle-emitter/emitter.ts';
import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.ts';
import type { SbomFileBuilder } from '../sbom/sbom-file.ts';
import type { VersionManager } from '../version-manager/manager.ts';
import { createPublishOperations } from './package-processor-publish.ts';

function stubDependencies() {
    return {
        bundleEmitter: {} as BundleEmitter,
        progressBroadcaster: {} as ProgressBroadcastProvider,
        sbomFileBuilder: {} as SbomFileBuilder,
        versionManager: {} as VersionManager,
        fileManager: {
            async checkReadability() {
                return { isReadable: true };
            },
            async readFile() {
                return '';
            }
        },
        repositoryFolder: '/'
    };
}

suite('package-processor-publish', function () {
    test('createPublishOperations exposes both buildAndPublish and tryBuildAndPublish operations', function () {
        const operations = createPublishOperations(stubDependencies());

        assert.strictEqual(typeof operations.buildAndPublish, 'function');
        assert.strictEqual(typeof operations.tryBuildAndPublish, 'function');
    });

    test('tryBuildAndPublish rejects a non-ESM mainPackageJson at the operations layer', async function () {
        const operations = createPublishOperations(stubDependencies());

        try {
            await operations.tryBuildAndPublish({
                analyzedBundle: { name: 'pkg-a' } as never,
                buildOptions: { mainPackageJson: { type: 'commonjs' } } as never,
                stage: false
            });
            assert.fail('expected tryBuildAndPublish to reject the non-ESM main package json');
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.strictEqual(error.message, 'mainPackageJson.type must be "module"');
        }
    });
});
