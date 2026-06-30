import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Maybe } from 'true-myth';
import {
    createConfig,
    createPacktoryUnderTest,
    createVersionedBundle,
    noPublicationOutcome,
    runPublishStageUntilFailure,
    type BuildOptionsInput
} from '../test-libraries/packtory-test-support.ts';

suite('packtory release analysis flow', function () {
    test('analyzeReleaseAgainstLatestPublished() disposes the report aggregator after the call completes', async function () {
        const { packtory, progressBroadcaster } = createPacktoryUnderTest();

        await packtory.analyzeReleaseAgainstLatestPublished(createConfig());

        assert.strictEqual(progressBroadcaster.provider.hasSubscribers('inputsResolved'), false);
    });

    test('analyzeReleaseAgainstLatestPublished() disposes the report aggregator even when the call throws', async function () {
        const resolveAndLink = fake(async function () {
            throw new Error('boom');
        });
        const { packtory, progressBroadcaster } = createPacktoryUnderTest({
            resolveAndLink,
            resolveStage: runPublishStageUntilFailure
        });

        await packtory.analyzeReleaseAgainstLatestPublished(createConfig());

        assert.strictEqual(progressBroadcaster.provider.hasSubscribers('inputsResolved'), false);
    });

    test('analyzeReleaseAgainstLatestPublished() exposes a getReport and classifies dependency-only package.json changes', async function () {
        const { packtory } = createPacktoryUnderTest({
            tryBuildAndPublish: fake(async function (options: BuildOptionsInput) {
                return {
                    bundle: createVersionedBundle(options.buildOptions.name, '1.0.1'),
                    status: 'new-version' as const,
                    publication: noPublicationOutcome,
                    extraFiles: [],
                    previousReleaseArtifacts: Maybe.just({
                        version: '1.0.0',
                        publishedAt: new Date('2026-05-01T00:00:00.000Z'),
                        gitHead: undefined,
                        files: [
                            {
                                filePath: 'package.json',
                                content: '{"name":"package-a","version":"1.0.0","dependencies":{"a":"1.0.0"}}',
                                isExecutable: false
                            }
                        ]
                    })
                };
            }),
            collectContents() {
                return [
                    {
                        filePath: 'package.json',
                        content: '{"name":"package-a","version":"1.0.1","dependencies":{"a":"1.1.0"}}',
                        isExecutable: false
                    }
                ];
            }
        });

        const outcome = await packtory.analyzeReleaseAgainstLatestPublished(createConfig());

        if (outcome.result.isErr) {
            assert.fail(`expected an Ok result, got ${JSON.stringify(outcome.result.error)}`);
        }
        assert.strictEqual(outcome.result.value.classification, 'dependency-only');
        assert.deepStrictEqual(outcome.result.value.mostRecentPublishedAt, new Date('2026-05-01T00:00:00.000Z'));
        assert.notStrictEqual(outcome.getReport().packages['package-a'], undefined);
    });
});
