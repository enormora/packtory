import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Result } from 'true-myth';
import {
    createConfig,
    createConfigWithoutRegistry,
    createLinkedBundle,
    createPacktoryUnderTest,
    twoPackageEntries,
    type ResolveOptionsInput
} from '../test-libraries/packtory-test-support.ts';

suite('packtory build config', function () {
    test('buildAndPublishAll() returns config issues when the config with registry is invalid', async function () {
        const { packtory } = createPacktoryUnderTest();

        const { result } = await packtory.buildAndPublishAll({ invalid: true }, { dryRun: true, stage: false });

        assert.deepStrictEqual(
            result,
            Result.err({
                type: 'config',
                issues: [ 'invalid value doesn’t match expected union' ]
            })
        );
    });

    test('buildAndPublishAll() fails fast with a single config issue when non-dry-run lacks auth', async function () {
        const buildAndPublish = fake();
        const tryBuildAndPublish = fake();
        const resolveAndLink = fake();
        const { packtory, scheduler } = createPacktoryUnderTest({
            resolveAndLink,
            buildAndPublish,
            tryBuildAndPublish
        });

        const { result } = await packtory.buildAndPublishAll(createConfigWithoutRegistry(), {
            dryRun: false,
            stage: false
        });

        assert.deepStrictEqual(
            result,
            Result.err({
                type: 'config',
                issues: [
                    'registrySettings.auth must be configured to publish; run with dryRun=true to skip the registry write.'
                ]
            })
        );
        assert.strictEqual(resolveAndLink.callCount, 0);
        assert.strictEqual(tryBuildAndPublish.callCount, 0);
        assert.strictEqual(buildAndPublish.callCount, 0);
        assert.strictEqual(scheduler.runForEachScheduledPackage.callCount, 0);
    });

    test('buildAndPublishAll() allows dry-run when auth is omitted (anonymous read)', async function () {
        const { packtory, tryBuildAndPublish, buildAndPublish } = createPacktoryUnderTest();

        const { result } = await packtory.buildAndPublishAll(createConfigWithoutRegistry(), {
            dryRun: true,
            stage: false
        });

        assert.strictEqual(result.isOk, true);
        assert.strictEqual(tryBuildAndPublish.callCount, 1);
        assert.strictEqual(buildAndPublish.callCount, 0);
    });

    test('buildAndPublishAll() returns check failures without entering publish mode', async function () {
        const buildAndPublish = fake();
        const tryBuildAndPublish = fake();
        const { packtory } = createPacktoryUnderTest({
            resolveAndLink: fake(async function (options: ResolveOptionsInput) {
                return createLinkedBundle(options.name, '/shared.js');
            }),
            buildAndPublish,
            tryBuildAndPublish
        });

        const { result } = await packtory.buildAndPublishAll(
            createConfig({
                checks: { noDuplicatedFiles: { enabled: true } },
                packages: twoPackageEntries
            }),
            { dryRun: false, stage: false }
        );

        assert.deepStrictEqual(
            result,
            Result.err({
                type: 'checks',
                issues: [ 'File "/shared.js" is included in multiple packages: package-a, package-b' ]
            })
        );
        assert.strictEqual(tryBuildAndPublish.callCount, 0);
        assert.strictEqual(buildAndPublish.callCount, 0);
    });
});
