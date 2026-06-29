import assert from 'node:assert';
import vm from 'node:vm';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Result } from 'true-myth';
import {
    assertFailureLog,
    assertFlagError,
    assertNoReleaseWork,
    createCurrentHeadRetryPackage,
    createReleaseHandlerDeps,
    createReleasePackage,
    createReleasePlanFailureOutcome,
    createReleasePlanOutcome,
    createReleasePlanOutcomesForPackage
} from '../../test-libraries/release-handler-test-support.ts';
import { runReleaseHandler } from './release-handler.ts';

suite('release-handler', function () {
    suite('planning', function () {
        test('prints the computed release plan when no action flags are set', async function () {
            const deps = createReleaseHandlerDeps();

            const code = await runReleaseHandler(deps);

            assert.strictEqual(code, 0);
            assert.match(String(deps.log.firstCall.args[0]), /Release plan:\n- pkg-a/u);
        });

        test('prints unpublished packages in the computed release plan', async function () {
            const deps = createReleaseHandlerDeps({
                planOutcomes: [
                    createReleasePlanOutcome([
                        createReleasePackage({
                            previousVersion: undefined,
                            artifactState: 'first-publish',
                            latestRegistryMetadata: undefined
                        })
                    ])
                ]
            });

            const code = await runReleaseHandler(deps);

            assert.strictEqual(code, 0);
            assert.match(String(deps.log.firstCall.args[0]), /unpublished -> 1\.0\.1/u);
        });
    });

    suite('flag validation', function () {
        test('rejects invalid flag combinations before planning', async function () {
            await assertFlagError({ commit: true, noDryRun: true }, '--commit requires --write-changelog');
        });

        test('prints multiple invalid flag combinations on separate lines', async function () {
            await assertFlagError(
                { writeChangelog: true, publish: true, push: true, noDryRun: true },
                '--write-changelog --publish requires --commit\n--push requires --commit or --tag'
            );
        });

        test('requires --no-dry-run for release writes', async function () {
            await assertFlagError({ publish: true }, 'Release writes require --no-dry-run');
        });

        test('rejects changelog publish without commit before planning', async function () {
            await assertFlagError(
                { writeChangelog: true, publish: true, noDryRun: true },
                '--write-changelog --publish requires --commit'
            );
        });

        test('rejects push without commit or tag before planning', async function () {
            await assertFlagError({ push: true, noDryRun: true }, '--push requires --commit or --tag');
        });

        test('rejects GitHub release without tag and push before planning', async function () {
            await assertFlagError({ githubRelease: true, noDryRun: true }, '--github-release requires --tag --push');
        });

        test('rejects GitHub release with tag but without push before planning', async function () {
            await assertFlagError(
                { tag: true, githubRelease: true, noDryRun: true },
                '--github-release requires --tag --push'
            );
        });

        test('rejects GitHub release with push but without tag before planning', async function () {
            await assertFlagError(
                { push: true, githubRelease: true, noDryRun: true },
                '--push requires --commit or --tag\n--github-release requires --tag --push'
            );
        });
    });

    suite('no-op planning', function () {
        test('prints no-op release plans without release targets', async function () {
            await assertNoReleaseWork({
                planOutcomes: createReleasePlanOutcomesForPackage(
                    createReleasePackage({ changed: false, artifactState: 'unchanged' })
                )
            });
        });

        test('does not treat missing current Git head as retry release work', async function () {
            await assertNoReleaseWork({
                flags: { tag: true, noDryRun: true },
                planOutcomes: createReleasePlanOutcomesForPackage(
                    createCurrentHeadRetryPackage({
                        currentGitHead: undefined,
                        latestRegistryMetadata: {
                            version: '1.0.1',
                            publishedAt: undefined,
                            gitHead: undefined
                        }
                    })
                )
            });
        });

        test('does not treat missing registry metadata as retry release work', async function () {
            await assertNoReleaseWork({
                flags: { tag: true, noDryRun: true },
                planOutcomes: createReleasePlanOutcomesForPackage(
                    createCurrentHeadRetryPackage({
                        latestRegistryMetadata: undefined
                    })
                )
            });
        });

        test('prints no-op release results when action flags have no release work', async function () {
            await assertNoReleaseWork({
                flags: { publish: true, noDryRun: true },
                planOutcomes: createReleasePlanOutcomesForPackage(
                    createCurrentHeadRetryPackage({
                        latestRegistryMetadata: {
                            version: '1.0.1',
                            publishedAt: undefined,
                            gitHead: 'old-head'
                        }
                    })
                )
            });
        });

        test('prints no-op release results for publish-only current-head retry packages', async function () {
            const deps = await assertNoReleaseWork({
                flags: { publish: true, noDryRun: true },
                planOutcomes: createReleasePlanOutcomesForPackage(createCurrentHeadRetryPackage())
            });

            assert.deepStrictEqual(deps.releaseSteps, [ 'plan' ]);
        });
    });

    suite('publish validation', function () {
        test('returns 1 when release planning fails', async function () {
            await assertFailureLog({ planOutcomes: [ createReleasePlanFailureOutcome() ] }, /Configuration issues/u);
        });

        test('prints non-Error release failures', async function () {
            await assertFailureLog({
                configLoader: {
                    async load() {
                        return vm.runInNewContext("Promise.reject('config load failed')") as Promise<unknown>;
                    }
                }
            }, /^config load failed$/u);
        });

        test('rejects tagging changed packages without publishing', async function () {
            await assertFailureLog({ flags: { tag: true, noDryRun: true } }, /--tag requires --publish/u);
        });

        test('returns 1 when publish fails', async function () {
            const buildAndPublishAll = fake.resolves({
                result: Result.err({ type: 'config', issues: [ 'publish failed' ] }),
                getReport() {
                    return undefined;
                }
            });
            const deps = createReleaseHandlerDeps({
                flags: { publish: true, noDryRun: true },
                buildAndPublishAll
            });

            const code = await runReleaseHandler(deps);

            assert.strictEqual(code, 1);
            assert.deepStrictEqual(buildAndPublishAll.firstCall.args[1], {
                dryRun: false,
                stage: false,
                collectReport: false
            });
            assert.match(String(deps.log.firstCall.args[0]), /publish failed/u);
        });

        test('prints publish partial failures as non-staged failures', async function () {
            const deps = createReleaseHandlerDeps({
                flags: { publish: true, noDryRun: true },
                buildAndPublishAll: fake.resolves({
                    result: Result.err({
                        type: 'partial',
                        succeeded: [
                            {
                                bundle: { name: 'pkg-a', version: '1.0.1' },
                                publication: { type: 'staged', stageId: 'stage-a' }
                            }
                        ],
                        failures: [ new Error('publish failed') ]
                    }),
                    getReport() {
                        return undefined;
                    }
                })
            });

            const code = await runReleaseHandler(deps);

            assert.strictEqual(code, 1);
            assert.strictEqual(deps.log.callCount, 1);
            assert.match(String(deps.log.firstCall.args[0]), /publish failed/u);
            assert.doesNotMatch(String(deps.log.firstCall.args[0]), /Staged packages/u);
        });

        test('ignores publish results outside the final release plan', async function () {
            const deps = createReleaseHandlerDeps({
                flags: { publish: true, tag: true, noDryRun: true },
                buildAndPublishAll: fake.resolves({
                    result: Result.ok([ { bundle: { name: 'pkg-b', version: '1.0.0' } } ]),
                    getReport() {
                        return undefined;
                    }
                })
            });

            const code = await runReleaseHandler(deps);

            assert.strictEqual(code, 0);
            assert.deepStrictEqual(deps.releaseSteps, [ 'plan', 'clean', 'head' ]);
        });
    });
});
