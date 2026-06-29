import assert from 'node:assert';
import { fake } from 'sinon';
import { Result } from 'true-myth';
import type { Packtory } from '../packtory/packtory.ts';
import type {
    PullRequestDetails,
    ReleasePullRequestGitHubClient
} from '../command-line-interface/runner/release-pr-github-client.ts';
import {
    runReleasePullRequestHandler,
    type ReleasePullRequestHandlerDependencies
} from '../command-line-interface/runner/release-pull-request-handler.ts';
import { createFakeFileManager } from './fake-file-manager.ts';
import { createBuildReportFixture } from './preview-fixtures.ts';
import { createReleasePullRequestConfig } from './runner-test-support.ts';

async function unusedPacktoryMethod(): Promise<never> {
    throw new Error('unused packtory method');
}

export function createPacktoryWithPlan(
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

export function createReleasePullRequestClient(
    overrides: Partial<ReleasePullRequestGitHubClient> = {}
): ReleasePullRequestGitHubClient {
    return {
        closeOpenReleasePullRequests: fake.resolves(undefined),
        createOrUpdateReleasePullRequest: fake.resolves(12),
        createStatus: fake.resolves(undefined),
        deleteActionRequiredPullRequestRuns: fake.resolves(undefined),
        dispatchWorkflow: fake.resolves(undefined),
        findDispatchedWorkflowRun: fake.resolves({
            event: 'workflow_dispatch',
            observedRunIds: [ 1 ],
            runId: 1
        }),
        getBranchHeadSha: fake.resolves('main-head'),
        getPullRequest: fake.resolves({
            author: 'github-actions[bot]',
            baseRef: 'main',
            changedFiles: [ 'CHANGELOG.md' ],
            headRef: 'release/packtory',
            headRepository: 'owner/repo',
            labels: [ 'release' ],
            mergeCommitSha: 'merge-sha',
            merged: true,
            number: 12,
            subject: 'Release packages',
            title: 'Prepare release'
        }),
        getPullRequestHead: fake.resolves({
            author: 'github-actions[bot]',
            changedFiles: [ 'CHANGELOG.md' ],
            headRef: 'release/packtory',
            labels: [ 'release' ],
            parentShas: [ 'main-head' ],
            subject: 'Release packages',
            title: 'Prepare release'
        }),
        listCommitPullRequests: fake.resolves([]),
        readWorkflowRunResult: fake.resolves({
            conclusion: 'success',
            databaseId: 1,
            url: 'https://github.com/enormora/packtory/actions/runs/1',
            jobs: [ { conclusion: 'success', name: 'Node.js', url: 'https://run/job' } ]
        }),
        ...overrides
    };
}

export type CreatedReleasePullRequestDependencies = {
    readonly dependencies: ReleasePullRequestHandlerDependencies;
    readonly log: ReturnType<typeof fake>;
};

export function createDependencies(
    overrides: Readonly<Partial<ReleasePullRequestHandlerDependencies>> = {}
): CreatedReleasePullRequestDependencies {
    const log = fake();
    const fileManager = createFakeFileManager();
    const releasePullRequestClient = createReleasePullRequestClient();
    const dependencies: ReleasePullRequestHandlerDependencies = {
        createGitHubReleaseClient: fake.returns({ createReleaseIfMissing: fake.resolves('created') }),
        createPrLogEngine: fake.returns({
            collectMergedPullRequests: fake.resolves([ { id: 1, title: 'Fix package' } ]),
            filterPullRequestsByTargetFiles: fake.returns([ { id: 1, title: 'Fix package' } ]),
            readPullRequestLabels: fake.resolves(new Map([ [ 1, [ 'bug' ] ] ])),
            readPullRequestChangedFiles: fake.resolves(new Map([ [ 1, [ 'src/index.ts' ] ] ])),
            renderChangelog: fake.returns('## 1.0.1\n\n* Fix package (#1)\n'),
            renderGroupedTargetChangelog: fake.returns('## 1.0.1\n\n* Fix package (#1)\n'),
            renderTargetChangelog: fake.returns('## 1.0.1\n\n* Fix package (#1)\n'),
            resolveChangelogBaseRef: fake.resolves({ ref: 'pkg@1.0.0' }),
            resolveLatestSemverChangelogBaseRef: fake.resolves({ ref: '1.0.0' }),
            resolvePullRequestLabels: fake.resolves([ { id: 1, label: 'bug', title: 'Fix package' } ]),
            updateChangelog: fake.returns('updated changelog')
        }),
        createReleasePullRequestGitHubClient: fake.returns(releasePullRequestClient),
        currentDate() {
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
        async readPackageInfo() {
            return { repository: { url: 'https://github.com/owner/repo' } };
        },
        sleep: fake.resolves(undefined),
        spinnerRenderer: { stopAll: fake() },
        configLoader: { load: fake.resolves(createReleasePullRequestConfig()) },
        workingDirectory: '/repo',
        ...overrides
    };
    return { dependencies, log };
}

export function createGitHubEnvironment(
    overrides: Readonly<Record<string, string>>
): (name: string) => string | undefined {
    return function (name: string) {
        return { GH_TOKEN: 'token', GITHUB_REPOSITORY: 'owner/repo', ...overrides }[name];
    };
}

export function createReleasePullRequestDetails(overrides: Partial<PullRequestDetails> = {}): PullRequestDetails {
    return {
        author: 'github-actions[bot]',
        baseRef: 'main',
        changedFiles: [ 'CHANGELOG.md' ],
        headRef: 'release/packtory',
        headRepository: 'owner/repo',
        labels: [ 'release' ],
        mergeCommitSha: 'merge-sha',
        merged: true,
        number: 12,
        subject: 'Release packages',
        title: 'Prepare release',
        ...overrides
    };
}

export async function assertHandlerFailure(
    setup: CreatedReleasePullRequestDependencies,
    expectedMessage: string
): Promise<void> {
    assert.strictEqual(await runReleasePullRequestHandler(setup.dependencies), 1);
    assert.strictEqual(setup.log.lastCall.args[0], expectedMessage);
}
