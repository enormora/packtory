import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { getErrResult, getOkResult } from '../test-libraries/result-helpers.ts';
import {
    createConfig,
    createConfigWithoutRegistry,
    createPacktoryUnderTest,
    createVersionedBundle
} from '../test-libraries/packtory-test-support.ts';

suite('packtory plan and pack', function () {
    test('planReleaseAgainstLatestPublished() returns config issues when the config with registry is invalid', async function () {
        const { packtory } = createPacktoryUnderTest();

        const { result } = await packtory.planReleaseAgainstLatestPublished({ invalid: true });

        if (result.isOk) {
            assert.fail('expected an Err result');
        }
        assert.strictEqual(result.error.type, 'config');
    });

    test('planReleaseAgainstLatestPublished() builds a release plan through the dry-run publish path', async function () {
        const { packtory, tryBuildAndPublish, buildAndPublish } = createPacktoryUnderTest({
            collectContents() {
                return [ { filePath: 'package/index.js', content: 'new', isExecutable: false } ];
            }
        });

        const { result } = await packtory.planReleaseAgainstLatestPublished(createConfig());

        if (result.isErr) {
            assert.fail(`expected an Ok result, got ${JSON.stringify(result.error)}`);
        }
        assert.deepStrictEqual(result.value.packages, [
            {
                name: 'package-a',
                previousVersion: undefined,
                nextVersion: '1.0.0',
                artifactState: 'first-publish',
                releaseClassification: 'first-publish',
                changed: true,
                previousGitHead: undefined,
                currentGitHead: undefined,
                latestRegistryMetadata: undefined,
                artifactFiles: [ 'index.js' ],
                changedArtifactFiles: [ 'index.js' ],
                sourceFiles: [ '/package-a/index.js' ],
                changelogSourceFiles: [ 'package-a/index.js' ],
                changelogDependencyNames: []
            }
        ]);
        assert.strictEqual(tryBuildAndPublish.callCount, 1);
        assert.strictEqual(buildAndPublish.callCount, 0);
    });

    test('planReleaseAgainstLatestPublished() exposes a getReport and disposes the report aggregator', async function () {
        const { packtory, progressBroadcaster } = createPacktoryUnderTest();

        const outcome = await packtory.planReleaseAgainstLatestPublished(createConfig());

        assert.notStrictEqual(outcome.getReport().packages['package-a'], undefined);
        assert.strictEqual(progressBroadcaster.provider.hasSubscribers('inputsResolved'), false);
    });

    const packPublicOptions = {
        packageName: 'package-a',
        format: 'zip' as const,
        outputPath: '/out/package-a.zip',
        version: '1.0.0',
        vendorDependencies: false
    };

    test('packPackage() returns a config failure when the supplied config is invalid', async function () {
        const { packtory } = createPacktoryUnderTest();

        const { result } = await packtory.packPackage({ invalid: true }, packPublicOptions);

        const error = getErrResult(result, 'expected packPackage() to fail with a config error');
        assert.strictEqual(error.type, 'config');
    });

    test('packPackage() returns Ok and forwards the bundle to packEmitter.pack when the config validates and the package is resolvable', async function () {
        const versionManagerAddVersion = fake.returns(createVersionedBundle('package-a'));
        const packEmitterPack = fake.resolves(undefined);
        const { packtory } = createPacktoryUnderTest({ versionManagerAddVersion, packEmitterPack });

        const { result } = await packtory.packPackage(createConfigWithoutRegistry(), packPublicOptions);

        getOkResult(result, 'expected packPackage() to succeed');
        assert.strictEqual(versionManagerAddVersion.callCount, 1);
        assert.strictEqual(packEmitterPack.callCount, 1);
    });
});
