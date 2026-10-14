import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Result } from 'true-myth';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import {
    createConfigurationWithoutRegistry,
    createConfigurationWithRegistry,
    createLinkedBundle,
    createPacktoryUnderTest,
    createPureSideEffectsEliminator,
    twoPackageEntries,
    type PacktoryUnderTest,
    type ResolveOptionsInput
} from '../test-libraries/package-orchestration-fixtures.ts';
import {
    getErrorResult,
    getOkResult
} from '../test-libraries/result-helpers.ts';

suite('packtory', function () {
    suite('resolve', function () {
        test('resolveAndLinkAll() returns config issues when the config without registry is invalid', async function () {
            const { packtory } = createPacktoryUnderTest();

            const { result } = await packtory.resolveAndLinkAll({ invalid: true });

            const error = getErrorResult(result, 'Expected resolveAndLinkAll() should fail but it did not');
            assert.strictEqual(error.type, 'configuration');
        });

        function createPacktoryThatSharesSourceFile(): PacktoryUnderTest {
            return createPacktoryUnderTest({
                resolveAndLink: fake(async function (options: ResolveOptionsInput) {
                    return createLinkedBundle(options.name, '/shared.js');
                })
            });
        }

        test('resolveAndLinkAll() returns check failures after the linked bundles were built', async function () {
            const { packtory } = createPacktoryThatSharesSourceFile();

            const { result } = await packtory.resolveAndLinkAll(
                createConfigurationWithoutRegistry({
                    checks: { noDuplicatedFiles: { enabled: true } },
                    packages: twoPackageEntries
                })
            );

            assert.deepStrictEqual(
                result,
                Result.err({
                    type: 'checks',
                    issues: [ 'File "/shared.js" is included in multiple packages: package-a, package-b' ]
                })
            );
        });

        test('resolveAndLinkAll() returns all resolved packages on success', async function () {
            const { packtory, resolveAndLink, scheduler } = createPacktoryUnderTest();

            const { result } = await packtory.resolveAndLinkAll(
                createConfigurationWithoutRegistry({
                    packages: [
                        { name: 'dependency', roots: { main: { javaScript: 'dependency/index.js' } } },
                        {
                            name: 'package-a',
                            roots: { main: { javaScript: 'package-a/index.js' } },
                            bundleDependencies: [ 'dependency' ]
                        }
                    ]
                })
            );

            const resolvedPackages = getOkResult(result, 'Expected resolveAndLinkAll() should succeed');
            assert.strictEqual(resolveAndLink.callCount, 2);
            assert.strictEqual(scheduler.runForEachScheduledPackage.callCount, 1);
            assert.deepStrictEqual(
                resolvedPackages.map(function (entry) {
                    return entry.name;
                }),
                [ 'dependency', 'package-a' ]
            );
        });
    });

    suite('facade operations', function () {
        suite('build and publish', function () {
            test('buildAndPublishAll() returns config issues when the config is invalid', async function () {
                const { packtory } = createPacktoryUnderTest();

                const { result } = await packtory.buildAndPublishAll({ invalid: true }, {
                    dryRun: true,
                    stage: false
                });

                const error = getErrorResult(result, 'Expected buildAndPublishAll() should fail but it did not');
                assert.strictEqual(error.type, 'configuration');
            });

            test('buildAndPublishAll() rejects real publishes without registry auth', async function () {
                const { packtory } = createPacktoryUnderTest();

                const { result } = await packtory.buildAndPublishAll(createConfigurationWithoutRegistry(), {
                    dryRun: false,
                    stage: false
                });

                assert.deepStrictEqual(
                    getErrorResult(result, 'Expected buildAndPublishAll() should fail but it did not'),
                    {
                        type: 'configuration',
                        issues: [
                            'registrySettings.authentication must be configured to publish; run with dryRun=true to skip the registry write.'
                        ]
                    }
                );
            });

            test('buildAndPublishAll() allows dry runs without registry auth', async function () {
                const { packtory, tryBuildAndPublish } = createPacktoryUnderTest();

                const { result, getReport } = await packtory.buildAndPublishAll(createConfigurationWithoutRegistry(), {
                    dryRun: true,
                    stage: false,
                    collectReport: true
                });

                assert.strictEqual(getOkResult(result, 'Expected buildAndPublishAll() should succeed').length, 1);
                assert.strictEqual(tryBuildAndPublish.callCount, 1);
                assertDefined(getReport());
            });

            test('buildAndPublishAll() runs real publishes when registry auth is configured', async function () {
                const { packtory, buildAndPublish } = createPacktoryUnderTest();

                const { result } = await packtory.buildAndPublishAll(createConfigurationWithRegistry(), {
                    dryRun: false,
                    stage: false
                });

                assert.strictEqual(getOkResult(result, 'Expected buildAndPublishAll() should succeed').length, 1);
                assert.strictEqual(buildAndPublish.callCount, 1);
            });
        });

        suite('reports', function () {
            test('diffAgainstLatestPublished() returns a required report and removes report subscribers', async function () {
                const { packtory, progressBroadcaster } = createPacktoryUnderTest();

                const { result, getReport } = await packtory.diffAgainstLatestPublished(
                    createConfigurationWithRegistry()
                );

                assert.strictEqual(
                    getOkResult(result, 'Expected diffAgainstLatestPublished() should succeed').length,
                    1
                );
                assertDefined(getReport());
                assert.strictEqual(progressBroadcaster.provider.hasSubscribers('done'), false);
            });

            test('diffAgainstLatestPublished() returns config issues when the config is invalid', async function () {
                const { packtory } = createPacktoryUnderTest();

                const { result } = await packtory.diffAgainstLatestPublished({ invalid: true });

                const error = getErrorResult(
                    result,
                    'Expected diffAgainstLatestPublished() should fail but it did not'
                );
                assert.strictEqual(error.type, 'configuration');
            });

            test('analyzeReleaseAgainstLatestPublished() returns analysis with a required report', async function () {
                const { packtory, progressBroadcaster } = createPacktoryUnderTest();

                const { result, getReport } = await packtory.analyzeReleaseAgainstLatestPublished(
                    createConfigurationWithRegistry()
                );

                assert.strictEqual(
                    getOkResult(result, 'Expected analyzeReleaseAgainstLatestPublished() should succeed')
                        .classification,
                    'first-publish'
                );
                assertDefined(getReport());
                assert.strictEqual(progressBroadcaster.provider.hasSubscribers('done'), false);
            });

            test('analyzeReleaseAgainstLatestPublished() returns config issues when the config is invalid', async function () {
                const { packtory } = createPacktoryUnderTest();

                const { result } = await packtory.analyzeReleaseAgainstLatestPublished({ invalid: true });

                const error = getErrorResult(
                    result,
                    'Expected analyzeReleaseAgainstLatestPublished() should fail but it did not'
                );
                assert.strictEqual(error.type, 'configuration');
            });

            test('planReleaseAgainstLatestPublished() returns a release plan with a required report', async function () {
                const { packtory, progressBroadcaster } = createPacktoryUnderTest();

                const { result, getReport } = await packtory.planReleaseAgainstLatestPublished(
                    createConfigurationWithRegistry()
                );

                assert.strictEqual(
                    getOkResult(result, 'Expected planReleaseAgainstLatestPublished() should succeed').packages.length,
                    1
                );
                assertDefined(getReport());
                assert.strictEqual(progressBroadcaster.provider.hasSubscribers('done'), false);
            });

            test('planReleaseAgainstLatestPublished() returns config issues when the config is invalid', async function () {
                const { packtory } = createPacktoryUnderTest();

                const { result } = await packtory.planReleaseAgainstLatestPublished({ invalid: true });

                const error = getErrorResult(
                    result,
                    'Expected planReleaseAgainstLatestPublished() should fail but it did not'
                );
                assert.strictEqual(error.type, 'configuration');
            });
        });

        suite('side effects', function () {
            test('inspectPackageSideEffects() returns config issues when the config is invalid', async function () {
                const { packtory } = createPacktoryUnderTest();

                const { result } = await packtory.inspectPackageSideEffects({ invalid: true }, 'package-a');

                const error = getErrorResult(result, 'Expected inspectPackageSideEffects() should fail but it did not');
                assert.strictEqual(error.type, 'configuration');
            });

            test('inspectPackageSideEffects() returns side effect inspection on success', async function () {
                const { packtory } = createPacktoryUnderTest({
                    deadCodeEliminator: createPureSideEffectsEliminator()
                });

                const { result } = await packtory.inspectPackageSideEffects(
                    createConfigurationWithoutRegistry(),
                    'package-a'
                );

                assert.deepStrictEqual(
                    getOkResult(result, 'Expected inspectPackageSideEffects() should succeed'),
                    {
                        packageName: 'package-a',
                        packageManifestDecision: { type: 'side-effects-false' },
                        impureFiles: []
                    }
                );
            });
        });
    });
});
