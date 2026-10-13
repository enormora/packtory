import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import type { PullRequestLogEngineOptions } from '../../changelog/pull-request-log.ts';
import {
    type CollectMergedPullRequestsOptions,
    assertConfiguredChangelogInputs,
    assertMissingGitHubRepositoryLog,
    assertReleasePlanFailureLogged,
    checkFailureOutcome,
    configurationFailureOutcome,
    configurationLoaderReturning,
    createEngine,
    dependenciesWith,
    makeSpies,
    partialFailureOutcome,
    releasePackage,
    validConfiguration,
    type Spies
} from '../../test-libraries/changelog-handler-fixtures.ts';
import { runChangelogHandler } from './changelog-handler.ts';

suite('changelog-handler', function () {
    suite('release output', function () {
        test('loads config, plans the release, and renders changelog markdown through the pager', async function () {
            const spies = makeSpies();

            const code = await runChangelogHandler(dependenciesWith({ spies }));

            assert.strictEqual(code, 0);
            assert.deepStrictEqual(
                {
                    planReleaseArguments: spies.planReleaseAgainstLatestPublished.firstCall.args,
                    createPullRequestLogEngine: spies.createPullRequestLogEngine.callCount,
                    pageOutputArguments: spies.pageOutput.firstCall.args,
                    stopAll: spies.stopAll.callCount
                },
                {
                    planReleaseArguments: [ validConfiguration ],
                    createPullRequestLogEngine: 1,
                    pageOutputArguments: [ '## package-a 1.0.1\n' ],
                    stopAll: 2
                }
            );
        });

        test('returns 1 and logs release-plan config failures without creating pr-log', async function () {
            await assertReleasePlanFailureLogged({
                releasePlanOutcome: configurationFailureOutcome([ 'bad config', 'worse config' ]),
                expectedLog: 'Configuration issues, there are 2 issue(s)\n\n- bad config\n- worse config'
            });
        });

        test('returns 1 and logs release-plan check failures without creating pr-log', async function () {
            await assertReleasePlanFailureLogged({
                releasePlanOutcome: checkFailureOutcome([ 'bad package', 'worse package' ]),
                expectedLog: 'Check issues, there are 2 issue(s)\n\n- bad package\n- worse package'
            });
        });

        test('does not render changelog output when the loaded config cannot be parsed', async function () {
            const spies = makeSpies();

            const code = await runChangelogHandler(
                dependenciesWith({
                    spies,
                    configurationLoader: configurationLoaderReturning({ packages: [] })
                })
            );

            assert.strictEqual(code, 0);
            assert.deepStrictEqual(
                {
                    createPullRequestLogEngine: spies.createPullRequestLogEngine.callCount,
                    pageOutput: spies.pageOutput.callCount
                },
                { createPullRequestLogEngine: 0, pageOutput: 0 }
            );
        });

        test('returns 1 and still renders succeeded changed packages for partial release-plan failures', async function () {
            const releasePlanOutcome = partialFailureOutcome({
                succeeded: [ releasePackage() ],
                failures: [
                    new Error('package-b failed', { cause: new Error('source map failed') }),
                    new Error('package-c failed')
                ]
            });
            const spies = makeSpies(createEngine(), releasePlanOutcome);

            const code = await runChangelogHandler(dependenciesWith({ spies }));

            assert.strictEqual(code, 1);
            assert.deepStrictEqual(
                { pageOutput: spies.pageOutput.callCount, logArguments: spies.log.firstCall.args },
                {
                    pageOutput: 1,
                    logArguments: [ '- package-b failed\n  Caused by: source map failed\n- package-c failed' ]
                }
            );
        });
    });

    suite('github inputs', function () {
        test('uses GITHUB_TOKEN when GH_TOKEN is not set', async function () {
            const engine = createEngine();
            const createPullRequestLogEngine = fake(function (options: Readonly<PullRequestLogEngineOptions>) {
                assert.strictEqual(options.githubToken, 'github-token');
                return engine;
            });
            const spies: Spies = {
                ...makeSpies(engine),
                createPullRequestLogEngine
            };

            const code = await runChangelogHandler(
                dependenciesWith({
                    spies,
                    readEnvironmentVariable(name) {
                        return name === 'GITHUB_TOKEN' ? 'github-token' : undefined;
                    }
                })
            );

            assert.strictEqual(code, 0);
            assert.strictEqual(createPullRequestLogEngine.callCount, 1);
        });

        test('passes the GitHub repo from package metadata into pr-log', async function () {
            const collectMergedPullRequests = fake(async function (input: CollectMergedPullRequestsOptions) {
                assert.strictEqual(input.githubRepository, 'owner/repo');
                return [];
            });
            const engine = {
                ...createEngine(),
                collectMergedPullRequests
            };
            const spies = makeSpies(engine);

            const code = await runChangelogHandler(dependenciesWith({ spies }));

            assert.strictEqual(code, 0);
            assert.strictEqual(collectMergedPullRequests.callCount, 1);
        });

        test('passes configured changelog label and base-ref settings into pr-log', async function () {
            const resolveChangelogBaseReference = fake.resolves({ reference: 'configured-base' });
            const resolvePullRequestLabels = fake.resolves([ {
                identifier: 1,
                title: 'Fix package',
                label: 'operations'
            } ]);
            const engine = createEngine({ resolveChangelogBaseReference, resolvePullRequestLabels });
            const spies = makeSpies(engine);

            const code = await runChangelogHandler(
                dependenciesWith({
                    spies,
                    configurationLoader: configurationLoaderReturning({
                        ...validConfiguration,
                        changelog: {
                            explicitBaseReference: 'main',
                            pullRequestLog: { validLabels: { operations: 'Operations' } },
                            packageTagFormat: 'pkg/{packageName}/v{version}',
                            targetScopedLabelPattern: 'scope:{targetName}:{label}'
                        }
                    })
                })
            );

            assert.strictEqual(code, 0);
            assertConfiguredChangelogInputs(resolveChangelogBaseReference, resolvePullRequestLabels);
        });
    });

    suite('repository validation', function () {
        test('returns 1 when package.json repository is not a GitHub repository', async function () {
            const spies = makeSpies();

            const code = await runChangelogHandler(
                dependenciesWith({
                    spies,
                    async readPackageInformation() {
                        return { repository: { url: 'https://example.com/owner/repo' } };
                    }
                })
            );

            assert.strictEqual(code, 1);
            assert.deepStrictEqual(
                { logArguments: spies.log.firstCall.args, pageOutput: spies.pageOutput.callCount },
                {
                    logArguments: [ 'package.json repository must point to a GitHub repository' ],
                    pageOutput: 0
                }
            );
        });

        test('returns 1 when package.json repository is missing', async function () {
            const spies = makeSpies();

            const code = await runChangelogHandler(
                dependenciesWith({
                    spies,
                    async readPackageInformation() {
                        return {};
                    }
                })
            );

            assert.strictEqual(code, 1);
            assertMissingGitHubRepositoryLog(spies);
        });

        test('returns 1 when package.json repository has a GitHub owner but no repo', async function () {
            const spies = makeSpies();

            const code = await runChangelogHandler(
                dependenciesWith({
                    spies,
                    async readPackageInformation() {
                        return { repository: { url: 'https://github.com/owner' } };
                    }
                })
            );

            assert.strictEqual(code, 1);
            assertMissingGitHubRepositoryLog(spies);
        });

        test('returns 1 when package.json repository only contains a GitHub URL suffix', async function () {
            const spies = makeSpies();

            const code = await runChangelogHandler(
                dependenciesWith({
                    spies,
                    async readPackageInformation() {
                        return { repository: { url: 'https://example.com/https://github.com/owner/repo' } };
                    }
                })
            );

            assert.strictEqual(code, 1);
            assertMissingGitHubRepositoryLog(spies);
        });

        test('returns 1 when package.json repository contains extra path segments after repo', async function () {
            const spies = makeSpies();

            const code = await runChangelogHandler(
                dependenciesWith({
                    spies,
                    async readPackageInformation() {
                        return { repository: { url: 'https://github.com/owner/repo/extra' } };
                    }
                })
            );

            assert.strictEqual(code, 1);
            assertMissingGitHubRepositoryLog(spies);
        });
    });

    suite('failure formatting', function () {
        test('does not page empty changelog output for changed packages', async function () {
            const engine = {
                ...createEngine(),
                renderGroupedTargetChangelog: fake.returns('')
            };
            const spies = makeSpies(engine);

            const code = await runChangelogHandler(dependenciesWith({ spies }));

            assert.strictEqual(code, 0);
            assert.strictEqual(spies.pageOutput.callCount, 0);
        });

        test('strips leading TypeError prefixes from thrown errors', async function () {
            const spies = makeSpies();

            const code = await runChangelogHandler(
                dependenciesWith({
                    spies,
                    configurationLoader: {
                        load: fake.rejects(new TypeError('bad config'))
                    }
                })
            );

            assert.strictEqual(code, 1);
            assert.deepStrictEqual(spies.log.firstCall.args, [ 'bad config' ]);
        });

        test('does not strip Error text that is not at the start of the message', async function () {
            const spies = makeSpies();

            const code = await runChangelogHandler(
                dependenciesWith({
                    spies,
                    configurationLoader: {
                        async load() {
                            throw new Error('prefix Error: bad config');
                        }
                    }
                })
            );

            assert.strictEqual(code, 1);
            assert.deepStrictEqual(spies.log.firstCall.args, [ 'prefix Error: bad config' ]);
        });

        test('does not strip embedded Error text from non-Error thrown values', async function () {
            const spies = makeSpies();
            const rejection = {
                toString() {
                    return 'prefix Error: bad config';
                }
            };
            const rejectedConfigurationLoad = {
                then(_resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
                    reject(rejection);
                }
            } as unknown as Promise<unknown>;

            const code = await runChangelogHandler(
                dependenciesWith({
                    spies,
                    configurationLoader: {
                        async load() {
                            return await rejectedConfigurationLoad;
                        }
                    }
                })
            );

            assert.strictEqual(code, 1);
            assert.deepStrictEqual(spies.log.firstCall.args, [ 'prefix Error: bad config' ]);
        });
    });
});
