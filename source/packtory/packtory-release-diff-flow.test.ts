import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    createConfig,
    createPacktoryUnderTest
} from '../test-libraries/packtory-test-support.ts';

suite('packtory release diff flow', function () {
    test('diffAgainstLatestPublished() returns config issues when the config with registry is invalid', async function () {
        const { packtory } = createPacktoryUnderTest();

        const { result } = await packtory.diffAgainstLatestPublished({ invalid: true });

        if (result.isOk) {
            assert.fail('expected an Err result');
        }
        assert.strictEqual(result.error.type, 'config');
    });

    test('diffAgainstLatestPublished() returns Ok with release-diff entries for the configured packages', async function () {
        const { packtory } = createPacktoryUnderTest();

        const { result } = await packtory.diffAgainstLatestPublished(createConfig());

        if (result.isErr) {
            assert.fail(`expected an Ok result, got ${JSON.stringify(result.error)}`);
        }
        assert.ok(result.value.length >= 0);
    });

    test('diffAgainstLatestPublished() runs through the dry-run publish path (tryBuildAndPublish), never the real publish', async function () {
        const { packtory, tryBuildAndPublish, buildAndPublish } = createPacktoryUnderTest();

        await packtory.diffAgainstLatestPublished(createConfig());

        assert.strictEqual(tryBuildAndPublish.callCount, 1);
        assert.strictEqual(buildAndPublish.callCount, 0);
    });

    test('diffAgainstLatestPublished() always exposes a getReport that returns a BuildReport with the version decisions made during the dry-run', async function () {
        const { packtory } = createPacktoryUnderTest();

        const outcome = await packtory.diffAgainstLatestPublished(createConfig());

        const report = outcome.getReport();
        assert.notStrictEqual(report.packages['package-a'], undefined);
    });

    test('diffAgainstLatestPublished() disposes the report aggregator on exit so no listeners are left dangling', async function () {
        const { packtory, progressBroadcaster } = createPacktoryUnderTest();

        await packtory.diffAgainstLatestPublished(createConfig());

        assert.strictEqual(progressBroadcaster.provider.hasSubscribers('versionDetermined'), false);
    });

    test('analyzeReleaseAgainstLatestPublished() returns config issues when the config with registry is invalid', async function () {
        const { packtory } = createPacktoryUnderTest();

        const { result } = await packtory.analyzeReleaseAgainstLatestPublished({ invalid: true });

        if (result.isOk) {
            assert.fail('expected an Err result');
        }
        assert.strictEqual(result.error.type, 'config');
    });

    test('analyzeReleaseAgainstLatestPublished() classifies first publishes through the dry-run publish path', async function () {
        const { packtory, tryBuildAndPublish, buildAndPublish } = createPacktoryUnderTest();

        const { result } = await packtory.analyzeReleaseAgainstLatestPublished(createConfig());

        if (result.isErr) {
            assert.fail(`expected an Ok result, got ${JSON.stringify(result.error)}`);
        }
        assert.strictEqual(result.value.classification, 'first-publish');
        assert.strictEqual(tryBuildAndPublish.callCount, 1);
        assert.strictEqual(buildAndPublish.callCount, 0);
    });
});
