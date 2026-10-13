import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import type { ReleasePlanPackage } from '../../packtory/packtory.ts';
import {
    assertAnnotatedTagCreated,
    assertNoReleaseWork,
    createDependencies,
    currentHeadPublishedPackage,
    failedPartialPublish,
    failedPublish,
    failedReleasePlan,
    publishResult,
    releasePackage,
    successfulPublish,
    validConfiguration
} from '../../test-libraries/release-handler-fixtures.ts';
import { createGitHubReleaseClientFixture } from '../../test-libraries/runner-test-support.ts';
import { runReleaseHandler } from './release-handler.ts';

suite('release-handler', function () {
    suite('plan and flag validation', function () {
        test('prints the release plan when no release action is requested', async function () {
            const dependencies = createDependencies();

            assert.strictEqual(await runReleaseHandler(dependencies), 0);
            assert.strictEqual(
                dependencies.log.firstCall.args[0],
                'Release plan:\n- package-a: 1.0.0 -> 1.0.1 (changed)'
            );
            assert.strictEqual(dependencies.buildAndPublishAll.callCount, 0);
        });

        test('prints unpublished packages in the release plan', async function () {
            const dependencies = createDependencies({
                packages: [ releasePackage({ previousVersion: undefined }) ]
            });

            assert.strictEqual(await runReleaseHandler(dependencies), 0);
            assert.strictEqual(
                dependencies.log.firstCall.args[0],
                'Release plan:\n- package-a: unpublished -> 1.0.1 (changed)'
            );
        });

        test('prints no release work when the plan has no changed packages', async function () {
            const dependencies = createDependencies({
                packages: [ releasePackage({ artifactState: 'unchanged', changed: false }) ]
            });

            await assertNoReleaseWork(dependencies);
        });

        test('requires no-dry-run for release writes', async function () {
            const dependencies = createDependencies({
                flags: { publish: true, tag: false, push: false, githubRelease: false, noDryRun: false }
            });

            assert.strictEqual(await runReleaseHandler(dependencies), 1);
            assert.strictEqual(dependencies.log.firstCall.args[0], 'Release writes require --no-dry-run');
            assert.strictEqual(dependencies.buildAndPublishAll.callCount, 0);
        });

        test('requires tag before push', async function () {
            const dependencies = createDependencies({
                flags: { publish: false, tag: false, push: true, githubRelease: false, noDryRun: true }
            });

            assert.strictEqual(await runReleaseHandler(dependencies), 1);
            assert.strictEqual(dependencies.log.firstCall.args[0], '--push requires --tag');
        });

        test('requires tag push before GitHub release creation', async function () {
            const dependencies = createDependencies({
                flags: { publish: false, tag: true, push: false, githubRelease: true, noDryRun: true }
            });

            assert.strictEqual(await runReleaseHandler(dependencies), 1);
            assert.strictEqual(dependencies.log.firstCall.args[0], '--github-release requires --tag --push');
        });

        test('prints multiple flag issues on separate lines', async function () {
            const dependencies = createDependencies({
                flags: { publish: false, tag: false, push: true, githubRelease: true, noDryRun: false }
            });

            assert.strictEqual(await runReleaseHandler(dependencies), 1);
            assert.strictEqual(
                dependencies.log.firstCall.args[0],
                '--push requires --tag\n--github-release requires --tag --push\nRelease writes require --no-dry-run'
            );
        });

        test('returns failure when release planning fails', async function () {
            const dependencies = createDependencies({
                planReleaseAgainstLatestPublished: failedReleasePlan()
            });

            assert.strictEqual(await runReleaseHandler(dependencies), 1);
            assert.match(String(dependencies.log.lastCall.args[0]), /invalid release plan/u);
        });

        test('prints a stack trace when an action error is caught with trace enabled', async function () {
            const latestRegistryMetadata: ReleasePlanPackage['latestRegistryMetadata'] = {
                gitHead: 'current-head',
                publishedAt: undefined,
                version: '1.0.1'
            };
            const dependencies = createDependencies({
                flags: { publish: false, tag: true, push: true, githubRelease: false, noDryRun: true },
                packages: [
                    releasePackage({
                        changed: false,
                        currentGitHead: 'current-head',
                        latestRegistryMetadata
                    })
                ],
                readPackageInformation: fake.rejects(new Error('repository failed')),
                trace: true
            });

            assert.strictEqual(await runReleaseHandler(dependencies), 1);
            assert.match(String(dependencies.log.firstCall.args[0]), /Stack trace: Error: repository failed/u);
        });
    });

    suite('publishing', function () {
        test('publishes packages and creates GitHub tags and releases', async function () {
            const ensureAnnotatedTag = fake.resolves('created');
            const createReleaseIfMissing = fake.resolves('created');
            const createGitHubReleaseClient = fake.returns(
                createGitHubReleaseClientFixture({ createReleaseIfMissing, ensureAnnotatedTag })
            );
            const dependencies = createDependencies({
                createGitHubReleaseClient,
                flags: { publish: true, tag: true, push: true, githubRelease: true, noDryRun: true }
            });

            assert.strictEqual(await runReleaseHandler(dependencies), 0);
            assert.deepStrictEqual(dependencies.buildAndPublishAll.firstCall.args, [
                validConfiguration,
                { dryRun: false, stage: false, collectReport: false }
            ]);
            assert.deepStrictEqual(createGitHubReleaseClient.firstCall.args, [
                { owner: 'owner', repository: 'repo', token: 'gh-token' }
            ]);
            assert.deepStrictEqual(ensureAnnotatedTag.firstCall.args, [
                { tagName: 'package-a@1.0.1', message: 'package-a@1.0.1', targetHead: 'release-head' }
            ]);
            assert.deepStrictEqual(createReleaseIfMissing.firstCall.args, [
                { tagName: 'package-a@1.0.1', name: 'package-a@1.0.1', body: '## package-a 1.0.1\n\n* Fix package' }
            ]);
            assert.strictEqual(dependencies.log.lastCall.args[0], 'Release completed.');
        });

        test('publishes without creating GitHub tags when only publish is requested', async function () {
            const dependencies = createDependencies({
                flags: { publish: true, tag: false, push: false, githubRelease: false, noDryRun: true }
            });

            assert.strictEqual(await runReleaseHandler(dependencies), 0);
            assert.deepStrictEqual([
                dependencies.buildAndPublishAll.callCount,
                dependencies.createGitHubReleaseClient.callCount
            ], [ 1, 0 ]);
            assert.strictEqual(dependencies.log.lastCall.args[0], 'Release completed.');
        });

        test('does not release current-head packages when only publish is requested', async function () {
            const dependencies = createDependencies({
                flags: { publish: true, tag: false, push: false, githubRelease: false, noDryRun: true },
                packages: [ currentHeadPublishedPackage() ]
            });

            await assertNoReleaseWork(dependencies);
        });

        test('reports publish failures', async function () {
            const dependencies = createDependencies({
                buildAndPublishAll: failedPublish(),
                flags: { publish: true, tag: false, push: false, githubRelease: false, noDryRun: true }
            });

            assert.strictEqual(await runReleaseHandler(dependencies), 1);
            assert.match(String(dependencies.log.lastCall.args[0]), /publish failed/u);
        });

        test('does not print staged receipts for release publish partial failures', async function () {
            const dependencies = createDependencies({
                buildAndPublishAll: failedPartialPublish(),
                flags: { publish: true, tag: false, push: false, githubRelease: false, noDryRun: true }
            });

            assert.strictEqual(await runReleaseHandler(dependencies), 1);
            assert.doesNotMatch(String(dependencies.log.lastCall.args[0]), /Staged packages/u);
        });

        test('creates retry tags after publish is requested for current-head packages', async function () {
            const ensureAnnotatedTag = fake.resolves('existing');
            const dependencies = createDependencies({
                createGitHubReleaseClient: fake.returns(createGitHubReleaseClientFixture({ ensureAnnotatedTag })),
                flags: { publish: true, tag: true, push: true, githubRelease: false, noDryRun: true },
                packages: [ currentHeadPublishedPackage() ]
            });

            assert.strictEqual(await runReleaseHandler(dependencies), 0);
            assert.strictEqual(dependencies.buildAndPublishAll.callCount, 0);
            assertAnnotatedTagCreated(ensureAnnotatedTag);
        });

        test('does not build GitHub release notes for publish results outside the release plan', async function () {
            const createReleaseIfMissing = fake.resolves('created');
            const ensureAnnotatedTag = fake.resolves('created');
            const dependencies = createDependencies({
                buildAndPublishAll: successfulPublish([ publishResult('other-pkg', '1.0.1') ]),
                createGitHubReleaseClient: fake.returns(
                    createGitHubReleaseClientFixture({ createReleaseIfMissing, ensureAnnotatedTag })
                ),
                flags: { publish: true, tag: true, push: true, githubRelease: true, noDryRun: true }
            });

            assert.strictEqual(await runReleaseHandler(dependencies), 0);
            assert.strictEqual(ensureAnnotatedTag.callCount, 0);
            assert.strictEqual(createReleaseIfMissing.callCount, 0);
            assert.strictEqual(dependencies.createPullRequestLogEngine.callCount, 0);
        });
    });

    suite('GitHub release publishing', function () {
        test('rejects tagging changed packages without publishing them first', async function () {
            const dependencies = createDependencies({
                flags: { publish: false, tag: true, push: true, githubRelease: false, noDryRun: true }
            });

            assert.strictEqual(await runReleaseHandler(dependencies), 1);
            assert.strictEqual(
                dependencies.log.lastCall.args[0],
                '--tag requires --publish unless registry latest already matches the current Git head'
            );
            assert.strictEqual(dependencies.buildAndPublishAll.callCount, 0);
        });

        test('tags current-head registry packages without publishing during retries', async function () {
            const ensureAnnotatedTag = fake.resolves('existing');
            const dependencies = createDependencies({
                createGitHubReleaseClient: fake.returns(createGitHubReleaseClientFixture({ ensureAnnotatedTag })),
                flags: { publish: false, tag: true, push: true, githubRelease: false, noDryRun: true },
                packages: [ currentHeadPublishedPackage({ artifactState: 'changed' }) ]
            });

            assert.strictEqual(await runReleaseHandler(dependencies), 0);
            assert.strictEqual(dependencies.buildAndPublishAll.callCount, 0);
            assertAnnotatedTagCreated(ensureAnnotatedTag);
        });

        test('does not tag retry packages that are not published at the current head', async function () {
            const cases = [
                currentHeadPublishedPackage({
                    latestRegistryMetadata: { version: '1.0.1', publishedAt: undefined, gitHead: 'other-head' }
                }),
                currentHeadPublishedPackage({ latestRegistryMetadata: undefined }),
                currentHeadPublishedPackage({
                    currentGitHead: undefined,
                    latestRegistryMetadata: { version: '1.0.1', publishedAt: undefined, gitHead: undefined }
                })
            ];

            for (const packagePlan of cases) {
                const dependencies = createDependencies({
                    flags: { publish: false, tag: true, push: true, githubRelease: false, noDryRun: true },
                    packages: [ packagePlan ]
                });

                assert.strictEqual(await runReleaseHandler(dependencies), 0);
                assert.strictEqual(dependencies.log.firstCall.args[0], 'No packages need release.');
                assert.strictEqual(dependencies.createGitHubReleaseClient.callCount, 0);
            }
        });

        test('rejects GitHub tagging when the release plan has no current head', async function () {
            const dependencies = createDependencies({
                flags: { publish: true, tag: true, push: true, githubRelease: false, noDryRun: true },
                packages: [ releasePackage({ currentGitHead: undefined }) ]
            });

            assert.strictEqual(await runReleaseHandler(dependencies), 1);
            assert.strictEqual(
                dependencies.log.lastCall.args[0],
                'GitHub tag target for "package-a@1.0.1" could not be determined'
            );
            assert.strictEqual(dependencies.buildAndPublishAll.callCount, 0);
        });

        test('requires a GitHub token when tags are created through the GitHub API', async function () {
            const dependencies = createDependencies({
                flags: { publish: true, tag: true, push: true, githubRelease: false, noDryRun: true },
                readEnvironmentVariable() {
                    return undefined;
                }
            });

            assert.strictEqual(await runReleaseHandler(dependencies), 1);
            assert.match(String(dependencies.log.lastCall.args[0]), /GH_TOKEN or GITHUB_TOKEN/u);
            assert.strictEqual(dependencies.buildAndPublishAll.callCount, 0);
        });

        test('uses GITHUB_TOKEN when GH_TOKEN is unset', async function () {
            const createGitHubReleaseClient = fake.returns(createGitHubReleaseClientFixture({}));
            const dependencies = createDependencies({
                createGitHubReleaseClient,
                flags: { publish: true, tag: true, push: true, githubRelease: false, noDryRun: true },
                readEnvironmentVariable(name) {
                    return name === 'GITHUB_TOKEN' ? 'github-token' : undefined;
                }
            });

            assert.strictEqual(await runReleaseHandler(dependencies), 0);
            assert.deepStrictEqual(createGitHubReleaseClient.firstCall.args, [
                { owner: 'owner', repository: 'repo', token: 'github-token' }
            ]);
        });
    });
});
