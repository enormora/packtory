import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import {
    createConfig,
    createConfigWithoutRegistry,
    createPacktoryUnderTest,
    runPublishStageUntilFailure
} from '../test-libraries/packtory-test-support.ts';

suite('packtory report lifecycle', function () {
    test('resolveAndLinkAll() disposes the report aggregator after the call completes', async function () {
        const { packtory, progressBroadcaster } = createPacktoryUnderTest();

        await packtory.resolveAndLinkAll(createConfigWithoutRegistry(), { collectReport: true });

        assert.strictEqual(progressBroadcaster.provider.hasSubscribers('inputsResolved'), false);
    });

    test('resolveAndLinkAll() disposes the report aggregator even when the call throws', async function () {
        const resolveAndLink = fake(async function () {
            throw new Error('boom');
        });
        const { packtory, progressBroadcaster } = createPacktoryUnderTest({
            resolveAndLink,
            resolveStage: runPublishStageUntilFailure
        });

        await packtory.resolveAndLinkAll(createConfigWithoutRegistry(), { collectReport: true });

        assert.strictEqual(progressBroadcaster.provider.hasSubscribers('inputsResolved'), false);
    });

    test('buildAndPublishAll() disposes the report aggregator after the call completes', async function () {
        const { packtory, progressBroadcaster } = createPacktoryUnderTest();

        await packtory.buildAndPublishAll(createConfig(), { dryRun: true, stage: false, collectReport: true });

        assert.strictEqual(progressBroadcaster.provider.hasSubscribers('inputsResolved'), false);
    });

    test('buildAndPublishAll() disposes the report aggregator even when the call throws', async function () {
        const buildAndPublish = fake(async function () {
            throw new Error('boom');
        });
        const tryBuildAndPublish = fake(async function () {
            throw new Error('boom');
        });
        const { packtory, progressBroadcaster } = createPacktoryUnderTest({
            buildAndPublish,
            tryBuildAndPublish,
            publishStage: runPublishStageUntilFailure
        });

        await packtory.buildAndPublishAll(createConfig(), { dryRun: true, stage: false, collectReport: true });

        assert.strictEqual(progressBroadcaster.provider.hasSubscribers('inputsResolved'), false);
    });

    test('resolveAndLinkAll() with collectReport=true returns a non-undefined getReport', async function () {
        const { packtory } = createPacktoryUnderTest();

        const outcome = await packtory.resolveAndLinkAll(createConfigWithoutRegistry(), { collectReport: true });

        assert.notStrictEqual(outcome.getReport(), undefined);
    });

    test('resolveAndLinkAll() without collectReport returns a getReport that yields undefined', async function () {
        const { packtory } = createPacktoryUnderTest();

        const outcome = await packtory.resolveAndLinkAll(createConfigWithoutRegistry());

        assert.strictEqual(outcome.getReport(), undefined);
    });

    test('buildAndPublishAll() with collectReport=true returns a non-undefined getReport', async function () {
        const { packtory } = createPacktoryUnderTest();

        const outcome = await packtory.buildAndPublishAll(createConfig(), {
            dryRun: true,
            stage: false,
            collectReport: true
        });

        assert.notStrictEqual(outcome.getReport(), undefined);
    });

    test('buildAndPublishAll() without collectReport returns a getReport that yields undefined', async function () {
        const { packtory } = createPacktoryUnderTest();

        const outcome = await packtory.buildAndPublishAll(createConfig(), { dryRun: true, stage: false });

        assert.strictEqual(outcome.getReport(), undefined);
    });
});
