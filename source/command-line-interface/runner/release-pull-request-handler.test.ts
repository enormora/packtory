import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Result } from 'true-myth';
import { createBuildReportFixture } from '../../test-libraries/preview-fixtures.ts';
import { createFakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import type { Packtory } from '../../packtory/packtory.ts';
import type { PullRequestDetails, ReleasePullRequestGitHubClient } from './release-pr-github-client.ts';
import {
    runReleasePullRequestHandler,
    type ReleasePullRequestHandlerDependencies
} from './release-pull-request-handler.ts';

function createReleasePackage() {
    return {
        name: 'pkg',
        previousVersion: '1.0.0',
        nextVersion: '1.0.1',
        artifactState: 'changed' as const,
        releaseClassification: 'substantive' as const,
        changed: true,
        previousGitHead: undefined,
        currentGitHead: 'current-head',
        latestRegistryMetadata: undefined,
        artifactFiles: ['dist/index.js'],
        changedArtifactFiles: ['dist/index.js'],
        sourceFiles: ['src/index.ts'],
        changelogDependencyNames: [],
        changelogSourceFiles: ['src/index.ts']
    };
}

function createConfig() {
    return {
        changelog: { outputs: [{ kind: 'repository-file', path: 'CHANGELOG.md' }] },
        packages: [
            {
                sourcesFolder: 'src',
                mainPackageJson: { type: 'module' },
                name: 'pkg',
                roots: { main: { js: 'index.js' } },
                publishSettings: { access: 'public' }
            }
        ]
    };
}

async function unusedPacktoryMethod(): Promise<never> {
    throw new Error('unused packtory method');
}

async function rejectWithUnknown(reason: unknown): Promise<never> {
    return new Promise((_resolve, reject) => {
        Reflect.apply(reject, undefined, [reason]);
    });
}

function createPacktoryWithPlan(
    planReleaseAgainstLatestPublished: Packtory['planReleaseAgainstLatestPublished']
): Packtory {
    return {
        analyzeReleaseAgainstLatestPublished: unusedPacktoryMethod,
        buildAndPublishAll: unusedPacktoryMethod,
        diffAgainstLatestPublished: unusedPacktoryMethod,
        packPackage: unusedPacktoryMethod,
        planReleaseAgainstLatestPublished,
        resolveAndLinkAll: unusedPacktoryMethod
    };
}

function createReleasePullRequestClient(
    overrides: Partial<ReleasePullRequestGitHubClient> = {}
): ReleasePullRequestGitHubClient {
    return {
        closeOpenReleasePullRequests: fake.resolves(undefined),
        createOrUpdateReleasePullRequest: fake.resolves(12),
        createStatus: fake.resolves(undefined),
        deleteActionRequiredPullRequestRuns: fake.resolves(undefined),
        dispatchWorkflow: fake.resolves(undefined),
        findDispatchedWorkflowRun: fake.resolves({ event: 'workflow_dispatch', observedRunIds: [1], runId: 1 }),
        getBranchHeadSha: fake.resolves('main-head'),
        getPullRequest: fake.resolves({
            author: 'github-actions[bot]',
            baseRef: 'main',
            changedFiles: ['CHANGELOG.md'],
            headRef: 'release/packtory',
            headRepository: 'owner/repo',
            labels: ['release'],
            mergeCommitSha: 'merge-sha',
            merged: true,
            number: 12,
            subject: 'Release packages',
            title: 'Prepare release'
        }),
        getPullRequestHead: fake.resolves({
            author: 'github-actions[bot]',
            changedFiles: ['CHANGELOG.md'],
            headRef: 'release/packtory',
            labels: ['release'],
            parentShas: ['main-head'],
            subject: 'Release packages',
            title: 'Prepare release'
        }),
        listCommitPullRequests: fake.resolves([]),
        readWorkflowRunResult: fake.resolves({
            conclusion: 'success',
            databaseId: 1,
            jobs: [{ conclusion: 'success', name: 'Node.js', url: 'https://run/job' }],
            url: 'https://run'
        }),
        ...overrides
    };
}

function createDependencies(overrides: Partial<ReleasePullRequestHandlerDependencies> = {}): {
    readonly dependencies: ReleasePullRequestHandlerDependencies;
    readonly log: ReturnType<typeof fake>;
} {
    const log = fake();
    const fileManager = createFakeFileManager();
    const releasePullRequestClient = createReleasePullRequestClient();
    const dependencies: ReleasePullRequestHandlerDependencies = {
        createGitHubReleaseClient: fake.returns({ createReleaseIfMissing: fake.resolves('created') }),
        createPrLogEngine: fake.returns({
            collectMergedPullRequests: fake.resolves([{ id: 1, title: 'Fix package' }]),
            filterPullRequestsByTargetFiles: fake.returns([{ id: 1, title: 'Fix package' }]),
            readPullRequestLabels: fake.resolves(new Map([[1, ['bug']]])),
            readPullRequestChangedFiles: fake.resolves(new Map([[1, ['src/index.ts']]])),
            renderChangelog: fake.returns('## 1.0.1\n\n* Fix package (#1)\n'),
            renderGroupedTargetChangelog: fake.returns('## 1.0.1\n\n* Fix package (#1)\n'),
            renderTargetChangelog: fake.returns('## 1.0.1\n\n* Fix package (#1)\n'),
            resolveChangelogBaseRef: fake.resolves({ ref: 'pkg@1.0.0' }),
            resolveLatestSemverChangelogBaseRef: fake.resolves({ ref: '1.0.0' }),
            resolvePullRequestLabels: fake.resolves([{ id: 1, label: 'bug', title: 'Fix package' }]),
            updateChangelog: fake.returns('updated changelog')
        }),
        createReleasePullRequestGitHubClient: fake.returns(releasePullRequestClient),
        currentDate: () => {
            return new Date('2026-06-13T00:00:00.000Z');
        },
        fileManager,
        flags: { command: 'authorize-publish', releasePullRequestNumber: undefined },
        gitClient: {
            commit: fake.resolves(undefined),
            currentHead: fake.resolves('head'),
            deleteRemoteBranch: fake.resolves(undefined),
            ensureClean: fake.resolves(undefined),
            ensureTag: fake.resolves(undefined),
            pushHeadToBranch: fake.resolves(undefined),
            pushFollowTags: fake.resolves(undefined)
        },
        log(message) {
            log(message);
        },
        packtory: createPacktoryWithPlan(
            fake.resolves({
                result: Result.ok({ packages: [] }),
                getReport() {
                    return createBuildReportFixture();
                }
            })
        ),
        readEnvironmentVariable(name) {
            return { GH_TOKEN: 'token', GITHUB_REPOSITORY: 'owner/repo', GITHUB_SHA: 'merge-sha' }[name];
        },
        readPackageInfo: async () => {
            return { repository: { url: 'https://github.com/owner/repo' } };
        },
        sleep: fake.resolves(undefined),
        spinnerRenderer: { stopAll: fake() },
        configLoader: { load: fake.resolves(createConfig()) },
        workingDirectory: '/repo',
        ...overrides
    };
    return { dependencies, log };
}

function createGitHubEnvironment(overrides: Record<string, string>) {
    return (name: string) => {
        return { GH_TOKEN: 'token', GITHUB_REPOSITORY: 'owner/repo', ...overrides }[name];
    };
}

function createReleasePullRequestDetails(overrides: Partial<PullRequestDetails> = {}): PullRequestDetails {
    return {
        author: 'github-actions[bot]',
        baseRef: 'main',
        changedFiles: ['CHANGELOG.md'],
        headRef: 'release/packtory',
        headRepository: 'owner/repo',
        labels: ['release'],
        mergeCommitSha: 'merge-sha',
        merged: true,
        number: 12,
        subject: 'Release packages',
        title: 'Prepare release',
        ...overrides
    };
}

function createValidateDependencies(input: {
    readonly client: ReleasePullRequestGitHubClient | undefined;
    readonly eventName: string;
    readonly eventPayload: unknown;
}) {
    const commonDependencies = {
        fileManager: createFakeFileManager({
            simulatedReadFileResponses: [{ value: JSON.stringify(input.eventPayload) }]
        }),
        flags: { command: 'validate', releasePullRequestNumber: undefined },
        readEnvironmentVariable: createGitHubEnvironment({
            GITHUB_EVENT_NAME: input.eventName,
            GITHUB_EVENT_PATH: '/event.json'
        })
    } satisfies Partial<ReleasePullRequestHandlerDependencies>;
    if (input.client === undefined) {
        return createDependencies(commonDependencies);
    }
    return createDependencies({
        ...commonDependencies,
        createReleasePullRequestGitHubClient: fake.returns(input.client)
    });
}

function createManualAuthorizationDependencies(fileManager = createFakeFileManager()) {
    return createDependencies({
        fileManager,
        flags: { command: 'authorize-publish', releasePullRequestNumber: '12' },
        readEnvironmentVariable: createGitHubEnvironment({
            GITHUB_OUTPUT: '/github-output',
            GITHUB_REF_NAME: 'main'
        })
    });
}

function createChangingReleaseGitClient(
    overrides: Partial<ReleasePullRequestHandlerDependencies['gitClient']> = {}
): ReleasePullRequestHandlerDependencies['gitClient'] {
    const heads = ['main-head', 'release-head'];
    return {
        commit: fake.resolves(undefined),
        async currentHead() {
            return heads.shift() ?? 'release-head';
        },
        deleteRemoteBranch: fake.resolves(undefined),
        ensureClean: fake.resolves(undefined),
        ensureTag: fake.resolves(undefined),
        pushHeadToBranch: fake.resolves(undefined),
        pushFollowTags: fake.resolves(undefined),
        ...overrides
    };
}

function createReleaseContentDependencies(overrides: Partial<ReleasePullRequestHandlerDependencies> = {}) {
    return createDependencies({
        flags: { command: 'maintain', noDryRun: true, releasePullRequestNumber: undefined },
        gitClient: createChangingReleaseGitClient(),
        packtory: createPacktoryWithPlan(
            fake.resolves({
                result: Result.ok({ packages: [createReleasePackage()] }),
                getReport() {
                    return createBuildReportFixture();
                }
            })
        ),
        ...overrides
    });
}

async function assertHandlerFailure(
    setup: ReturnType<typeof createDependencies>,
    expectedMessage: string
): Promise<void> {
    assert.strictEqual(await runReleasePullRequestHandler(setup.dependencies), 1);
    assert.strictEqual(setup.log.lastCall.args[0], expectedMessage);
}

type AuthorizePublishEnvironment = Readonly<
    Record<'GH_TOKEN' | 'GITHUB_REPOSITORY' | 'GITHUB_SHA', string | undefined>
>;

function createAuthorizePublishEnvironment(input: AuthorizePublishEnvironment) {
    return (name: string) => {
        return input[name as keyof AuthorizePublishEnvironment];
    };
}

suite('release-pull-request-handler', function () {
    test('maintain requires no-dry-run', async function () {
        const { dependencies, log } = createDependencies({
            flags: { command: 'maintain', noDryRun: false, releasePullRequestNumber: undefined }
        });

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
        assert.strictEqual(log.firstCall.args[0], 'Release PR writes require --no-dry-run');
    });

    test('maintain closes release state when no release content remains', async function () {
        const deleteRemoteBranch = fake.resolves(undefined);
        const closeOpenReleasePullRequests = fake.resolves(undefined);
        const { dependencies, log } = createDependencies({
            createReleasePullRequestGitHubClient: fake.returns(
                createReleasePullRequestClient({
                    closeOpenReleasePullRequests
                })
            ),
            flags: { command: 'maintain', noDryRun: true, releasePullRequestNumber: undefined },
            gitClient: {
                commit: fake.resolves(undefined),
                currentHead: fake.resolves('head'),
                deleteRemoteBranch,
                ensureClean: fake.resolves(undefined),
                ensureTag: fake.resolves(undefined),
                pushHeadToBranch: fake.resolves(undefined),
                pushFollowTags: fake.resolves(undefined)
            }
        });

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
        assert.strictEqual(deleteRemoteBranch.callCount, 1);
        assert.deepStrictEqual(closeOpenReleasePullRequests.firstCall.args[0], {
            baseBranch: 'main',
            releaseBranch: 'release/packtory'
        });
        assert.strictEqual(log.lastCall.args[0], 'No release content remains');
    });

    test('maintain updates the release PR when changelog content is committed', async function () {
        const commit = fake.resolves(undefined);
        const createOrUpdateReleasePullRequest = fake.resolves(12);
        const pushHeadToBranch = fake.resolves(undefined);
        const pushFollowTags = fake.resolves(undefined);
        const { dependencies, log } = createReleaseContentDependencies({
            createReleasePullRequestGitHubClient: fake.returns(
                createReleasePullRequestClient({
                    createOrUpdateReleasePullRequest
                })
            ),
            gitClient: createChangingReleaseGitClient({ commit, pushFollowTags, pushHeadToBranch })
        });

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
        assert.strictEqual(commit.callCount, 1);
        assert.deepStrictEqual(pushHeadToBranch.firstCall.args, ['release/packtory']);
        assert.strictEqual(pushFollowTags.callCount, 0);
        assert.deepStrictEqual(createOrUpdateReleasePullRequest.firstCall.args[0], {
            baseBranch: 'main',
            body: 'Updates changelogs for the next release.',
            label: 'release',
            releaseBranch: 'release/packtory',
            title: 'Prepare release'
        });
        assert.strictEqual(log.lastCall.args[0], 'Release PR #12 points at release-head');
    });

    test('maintain returns failure when configured release PR CI fails', async function () {
        const { dependencies, log } = createReleaseContentDependencies({
            configLoader: {
                load: fake.resolves({
                    ...createConfig(),
                    releasePullRequest: {
                        githubActionsCi: {
                            trigger: 'workflow-dispatch',
                            workflowFile: 'ci.yml',
                            requiredStatusContexts: ['Missing job']
                        }
                    }
                })
            }
        });

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
        assert.strictEqual(log.lastCall.args[0], 'Release PR #12 points at release-head');
    });

    test('maintain reports release preparation failures', async function () {
        const { dependencies, log } = createDependencies({
            flags: { command: 'maintain', noDryRun: true, releasePullRequestNumber: undefined },
            packtory: createPacktoryWithPlan(
                fake.resolves({
                    result: Result.err({ type: 'config', issues: ['Registry failed'] }),
                    getReport() {
                        return createBuildReportFixture();
                    }
                })
            )
        });

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
        assert.strictEqual(log.lastCall.args[0], 'Release preparation failed');
    });

    test('maintain rejects configs without valid packages', async function () {
        const { dependencies, log } = createDependencies({
            configLoader: { load: fake.resolves({}) },
            flags: { command: 'maintain', noDryRun: true, releasePullRequestNumber: undefined }
        });

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
        assert.strictEqual(log.lastCall.args[0], 'The loaded config is invalid for release PR management');
    });

    test('maintain rejects invalid release pull request settings', async function () {
        const { dependencies, log } = createDependencies({
            configLoader: {
                load: fake.resolves({
                    ...createConfig(),
                    releasePullRequest: {
                        githubActionsCi: {
                            trigger: 'workflow-dispatch',
                            workflowFile: 'ci.yml',
                            requiredStatusContexts: []
                        }
                    }
                })
            },
            flags: { command: 'maintain', noDryRun: true, releasePullRequestNumber: undefined }
        });

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
        assert.strictEqual(log.lastCall.args[0], 'The loaded config is invalid for release PR management');
    });

    test('formats non-error command failures', async function () {
        const { dependencies, log } = createDependencies({
            configLoader: {
                async load() {
                    return rejectWithUnknown('plain failure');
                }
            },
            flags: { command: 'maintain', noDryRun: true, releasePullRequestNumber: undefined }
        });

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
        assert.strictEqual(log.lastCall.args[0], 'plain failure');
    });

    test('validate accepts a normal pull request without the release label', async function () {
        const { dependencies, log } = createValidateDependencies({
            eventName: 'pull_request',
            eventPayload: { pull_request: { number: 12 } },
            client: createReleasePullRequestClient({
                getPullRequestHead: fake.resolves({
                    author: 'maintainer',
                    changedFiles: ['src/index.ts'],
                    headRef: 'feature',
                    labels: ['bug'],
                    parentShas: ['branch-head'],
                    subject: 'Fix bug',
                    title: 'Fix bug'
                })
            })
        });

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
        assert.strictEqual(log.lastCall.args[0], 'Release PR policy passed.');
    });

    test('validate accepts a release pull request that follows the policy', async function () {
        const { dependencies, log } = createValidateDependencies({
            client: undefined,
            eventName: 'pull_request',
            eventPayload: { pull_request: { number: 12 } }
        });

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
        assert.strictEqual(log.lastCall.args[0], 'Release PR policy passed.');
    });

    test('validate rejects release pull requests that violate the policy', async function () {
        const { dependencies, log } = createValidateDependencies({
            eventName: 'pull_request',
            eventPayload: { pull_request: { number: 12 } },
            client: createReleasePullRequestClient({
                getPullRequestHead: fake.resolves({
                    author: 'github-actions[bot]',
                    changedFiles: ['src/index.ts'],
                    headRef: 'release/packtory',
                    labels: ['release'],
                    parentShas: ['main-head'],
                    subject: 'Release packages',
                    title: 'Prepare release'
                })
            })
        });

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
        assert.strictEqual(log.lastCall.args[0], 'Unexpected release PR file change: src/index.ts');
    });

    test('validate rejects pull request events without a pull request number', async function () {
        for (const eventPayload of [{}, { pull_request: {} }]) {
            await assertHandlerFailure(
                createValidateDependencies({
                    client: undefined,
                    eventName: 'pull_request',
                    eventPayload
                }),
                'GitHub pull_request event payload is missing pull_request.number'
            );
        }
    });

    test('validate accepts a merge group that contains only the release pull request', async function () {
        const { dependencies, log } = createValidateDependencies({
            eventName: 'merge_group',
            eventPayload: { merge_group: { base_sha: 'main-head', head_sha: 'merge-group-head' } },
            client: createReleasePullRequestClient({
                listCommitPullRequests: fake.resolves([createReleasePullRequestDetails()])
            })
        });

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
        assert.strictEqual(log.lastCall.args[0], 'Release PR policy passed.');
    });

    test('validate rejects merge group events without merge group SHAs', async function () {
        for (const eventPayload of [
            {},
            { merge_group: {} },
            { merge_group: { base_sha: 'main-head' } },
            { merge_group: { head_sha: 'merge-group-head' } }
        ]) {
            await assertHandlerFailure(
                createValidateDependencies({
                    client: undefined,
                    eventName: 'merge_group',
                    eventPayload
                }),
                'GitHub merge_group event payload is missing merge group SHAs'
            );
        }
    });

    test('validate rejects unsupported GitHub events', async function () {
        const { dependencies, log } = createValidateDependencies({
            client: undefined,
            eventName: 'push',
            eventPayload: {}
        });

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
        assert.strictEqual(
            log.lastCall.args[0],
            'release-pr validate only supports pull_request and merge_group events'
        );
    });

    test('validate rejects non-object GitHub event payloads', async function () {
        for (const eventPayload of [null, 'not an event']) {
            await assertHandlerFailure(
                createValidateDependencies({
                    client: undefined,
                    eventName: 'pull_request',
                    eventPayload
                }),
                'GitHub event payload must be an object'
            );
        }
    });

    test('authorize-publish writes GitHub output for manual retries', async function () {
        const fileManager = createFakeFileManager();
        const { dependencies } = createManualAuthorizationDependencies(fileManager);

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
        assert.strictEqual(
            fileManager.getWriteFileCall(0).content,
            [
                'should_publish=true',
                'publish_commit_sha=merge-sha',
                'release_commit_sha=merge-sha',
                'release_pull_request_number=12',
                ''
            ].join('\n')
        );
    });

    test('authorize-publish writes GitHub output when no previous output file is readable', async function () {
        const fileManager = createFakeFileManager({
            simulatedReadFileResponses: [{ error: new Error('missing output') }]
        });
        const { dependencies } = createManualAuthorizationDependencies(fileManager);

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
        assert.strictEqual(fileManager.getWriteFileCall(0).content.startsWith('should_publish=true\n'), true);
    });

    test('authorize-publish appends to existing GitHub output', async function () {
        const fileManager = createFakeFileManager({
            simulatedReadFileResponses: [{ value: 'existing=true\n' }]
        });
        const { dependencies } = createManualAuthorizationDependencies(fileManager);

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
        assert.strictEqual(
            fileManager.getWriteFileCall(0).content.startsWith('existing=true\nshould_publish=true\n'),
            true
        );
    });

    test('authorize-publish rejects manual retries from non-default branches', async function () {
        const { dependencies, log } = createDependencies({
            flags: { command: 'authorize-publish', releasePullRequestNumber: '12' },
            readEnvironmentVariable(name) {
                return {
                    GH_TOKEN: 'token',
                    GITHUB_REF_NAME: 'feature',
                    GITHUB_REPOSITORY: 'owner/repo'
                }[name];
            }
        });

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
        assert.strictEqual(log.lastCall.args[0], 'Manual release publish retries must run from main');
    });

    test('authorize-publish logs push authorization when the commit belongs to one release PR', async function () {
        const { dependencies, log } = createDependencies({
            createReleasePullRequestGitHubClient: fake.returns(
                createReleasePullRequestClient({
                    listCommitPullRequests: fake.resolves([createReleasePullRequestDetails()])
                })
            )
        });

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
        assert.strictEqual(
            log.lastCall.args[0],
            [
                'should_publish=true',
                'publish_commit_sha=merge-sha',
                'release_commit_sha=merge-sha',
                'release_pull_request_number=12'
            ].join('\n')
        );
    });

    test('rejects malformed GitHub repository environment values', async function () {
        for (const repository of ['owner', '', '/repo', 'owner/', 'owner/repo/extra']) {
            await assertHandlerFailure(
                createDependencies({
                    flags: { command: 'authorize-publish', releasePullRequestNumber: undefined },
                    readEnvironmentVariable: createAuthorizePublishEnvironment({
                        GH_TOKEN: 'token',
                        GITHUB_REPOSITORY: repository,
                        GITHUB_SHA: 'merge-sha'
                    })
                }),
                'GITHUB_REPOSITORY must use owner/repo format'
            );
        }
    });

    test('uses package repository metadata when GitHub repository environment is absent', async function () {
        const createReleasePullRequestGitHubClient = fake.returns(createReleasePullRequestClient());
        const { dependencies } = createDependencies({
            createReleasePullRequestGitHubClient,
            flags: { command: 'authorize-publish', releasePullRequestNumber: undefined },
            readEnvironmentVariable(name) {
                return { GH_TOKEN: 'token', GITHUB_SHA: 'merge-sha' }[name];
            }
        });

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
        assert.deepStrictEqual(createReleasePullRequestGitHubClient.firstCall.args[0], {
            owner: 'owner',
            repo: 'repo',
            token: 'token'
        });
    });

    test('requires a GitHub token', async function () {
        const { dependencies, log } = createDependencies({
            flags: { command: 'authorize-publish', releasePullRequestNumber: undefined },
            readEnvironmentVariable(name) {
                return { GITHUB_REPOSITORY: 'owner/repo', GITHUB_SHA: 'merge-sha' }[name];
            }
        });

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
        assert.strictEqual(log.lastCall.args[0], 'GH_TOKEN or GITHUB_TOKEN must be set');
    });

    test('uses GITHUB_TOKEN when GH_TOKEN is absent', async function () {
        const createReleasePullRequestGitHubClient = fake.returns(createReleasePullRequestClient());
        const { dependencies } = createDependencies({
            createReleasePullRequestGitHubClient,
            flags: { command: 'authorize-publish', releasePullRequestNumber: undefined },
            readEnvironmentVariable(name) {
                return { GITHUB_REPOSITORY: 'owner/repo', GITHUB_SHA: 'merge-sha', GITHUB_TOKEN: 'github-token' }[name];
            }
        });

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
        assert.deepStrictEqual(createReleasePullRequestGitHubClient.firstCall.args[0], {
            owner: 'owner',
            repo: 'repo',
            token: 'github-token'
        });
    });

    test('requires a commit SHA for push publish authorization', async function () {
        for (const commitSha of [undefined, '']) {
            await assertHandlerFailure(
                createDependencies({
                    flags: { command: 'authorize-publish', releasePullRequestNumber: undefined },
                    readEnvironmentVariable: createAuthorizePublishEnvironment({
                        GH_TOKEN: 'token',
                        GITHUB_REPOSITORY: 'owner/repo',
                        GITHUB_SHA: commitSha
                    })
                }),
                'GITHUB_SHA must be set'
            );
        }
    });
});
