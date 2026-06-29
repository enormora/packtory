import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Maybe, Result } from 'true-myth';
import {
    createConfig,
    createConfigWithoutRegistry,
    createPacktoryUnderTest,
    createVersionedBundle,
    noPublicationOutcome,
    publishedOutcome,
    runPublishStageUntilFailure,
    type PackageFailedEvent,
    type PacktoryUnderTest
} from '../test-libraries/packtory-test-support.ts';

suite('packtory build execution', function () {
    test('buildAndPublishAll() uses tryBuildAndPublish() in dry-run mode and returns successful publish results', async function () {
        const { packtory, tryBuildAndPublish, buildAndPublish, scheduler } = createPacktoryUnderTest();

        const { result } = await packtory.buildAndPublishAll(createConfig(), { dryRun: true, stage: false });

        assert.deepStrictEqual(
            result,
            Result.ok([
                {
                    bundle: createVersionedBundle('package-a'),
                    status: 'initial-version',
                    publication: noPublicationOutcome,
                    extraFiles: [],
                    previousReleaseArtifacts: Maybe.nothing()
                }
            ])
        );
        assert.strictEqual(tryBuildAndPublish.callCount, 1);
        assert.strictEqual(buildAndPublish.callCount, 0);
        assert.strictEqual(scheduler.runForEachScheduledPackage.callCount, 2);
    });

    test('buildAndPublishAll() uses buildAndPublish() outside dry-run mode', async function () {
        const { packtory, tryBuildAndPublish, buildAndPublish } = createPacktoryUnderTest();

        const { result } = await packtory.buildAndPublishAll(createConfig(), { dryRun: false, stage: false });

        assert.deepStrictEqual(
            result,
            Result.ok([
                {
                    bundle: createVersionedBundle('package-a'),
                    status: 'new-version',
                    publication: publishedOutcome,
                    extraFiles: [],
                    previousReleaseArtifacts: Maybe.nothing()
                }
            ])
        );
        assert.strictEqual(tryBuildAndPublish.callCount, 0);
        assert.strictEqual(buildAndPublish.callCount, 1);
    });

    function subscribeToPackageFailed(
        progressBroadcaster: PacktoryUnderTest['progressBroadcaster']
    ): PackageFailedEvent[] {
        const received: PackageFailedEvent[] = [];
        progressBroadcaster.consumer.on('packageFailed', function (payload) {
            received.push({ packageName: payload.packageName, stage: payload.stage, message: payload.message });
        });
        return received;
    }

    test('resolveAndLinkAll() emits packageFailed with stage "resolveAndLink" when the resolve step throws', async function () {
        const resolveAndLink = fake(async function () {
            throw new Error('resolve crashed');
        });
        const { packtory, progressBroadcaster } = createPacktoryUnderTest({
            resolveAndLink,
            resolveStage: runPublishStageUntilFailure
        });
        const received = subscribeToPackageFailed(progressBroadcaster);

        await packtory.resolveAndLinkAll(createConfigWithoutRegistry());

        assert.deepStrictEqual(received, [
            { packageName: 'package-a', stage: 'resolveAndLink', message: 'resolve crashed' }
        ]);
    });

    test('buildAndPublishAll() emits packageFailed with stage "publish" when the publish step throws', async function () {
        const buildAndPublish = fake(async function () {
            throw new Error('publish crashed');
        });
        const tryBuildAndPublish = fake(async function () {
            throw new Error('publish crashed');
        });
        const { packtory, progressBroadcaster } = createPacktoryUnderTest({
            buildAndPublish,
            tryBuildAndPublish,
            publishStage: runPublishStageUntilFailure
        });
        const received = subscribeToPackageFailed(progressBroadcaster);

        await packtory.buildAndPublishAll(createConfig(), { dryRun: true, stage: false });

        const publishFailures = received.filter(function (entry) {
            return entry.stage === 'publish';
        });
        assert.deepStrictEqual(publishFailures, [
            { packageName: 'package-a', stage: 'publish', message: 'publish crashed' }
        ]);
    });
});
