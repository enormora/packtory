import assert from 'node:assert';
import { fake } from 'sinon';
import { Result } from 'true-myth';
import type { Packtory, ReleasePlanPackage } from '../packtory/packtory.ts';
import type { ReleasePullRequestHandlerDependencies } from '../command-line-interface/runner/release-pull-request-handler.ts';
import type { ReleasePullRequestGitHubClient } from '../command-line-interface/runner/release-pr-github-client.ts';
import { createBuildReportFixture } from './preview-fixtures.ts';
import { createFakeFileManager } from './fake-file-manager.ts';
import {
    createReleaseGitClientFixture,
    createReleasePullRequestClient,
    createReleasePullRequestConfig
} from './runner-test-support.ts';

function createReleasePackage(): ReleasePlanPackage {
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
        artifactFiles: [ 'dist/index.js' ],
        changedArtifactFiles: [ 'dist/index.js' ],
        sourceFiles: [ 'src/index.ts' ],
        changelogSourceFiles: [ 'src/index.ts' ],
        changelogDependencyNames: []
    };
}

async function unusedPacktoryMethod(): Promise<never> {
    throw new Error('unused packtory method');
}

export async function rejectWithUnknown(reason: unknown): Promise<never> {
    return new Promise(function (_resolve, reject) {
        Reflect.apply(reject, undefined, [ reason ]);
    });
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

export type CreatedReleasePullRequestDependencies = {
    readonly dependencies: ReleasePullRequestHandlerDependencies;
    readonly log: ReturnType<typeof fake>;
};

export function createDependencies(
    overrides: Readonly<Partial<ReleasePullRequestHandlerDependencies>> = {}
): CreatedReleasePullRequestDependencies {
    const log = fake();
    const fileManager = createFakeFileManager();
    const releasePullRequestClient = createReleasePullRequestClient({
        createOrUpdateReleasePullRequest: fake.resolves(12),
        findDispatchedWorkflowRun: fake.resolves({ event: 'workflow_dispatch', observedRunIds: [ 1 ], runId: 1 }),
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
        readWorkflowRunResult: fake.resolves({
            conclusion: 'success',
            databaseId: 1,
            url: 'https://github.com/enormora/packtory/actions/runs/1',
            jobs: [ { conclusion: 'success', name: 'Node.js', url: 'https://run/job' } ]
        })
    });
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
        gitClient: createReleaseGitClientFixture({ currentHead: fake.resolves('head') }),
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

export function createChangingReleaseGitClient(
    overrides: Readonly<Partial<ReleasePullRequestHandlerDependencies['gitClient']>> = {}
): ReleasePullRequestHandlerDependencies['gitClient'] {
    const heads = [ 'main-head', 'release-head' ];
    return createReleaseGitClientFixture({
        async currentHead() {
            return heads.shift() ?? 'release-head';
        },
        readChangedFiles: fake.resolves([
            {
                contentBase64: Buffer.from('updated changelog\n', 'utf8').toString('base64'),
                kind: 'addition',
                path: 'CHANGELOG.md'
            }
        ]),
        ...overrides
    });
}

export function createReleaseContentDependencies(
    overrides: Readonly<Partial<ReleasePullRequestHandlerDependencies>> = {}
): CreatedReleasePullRequestDependencies {
    return createDependencies({
        flags: { command: 'maintain', noDryRun: true, releasePullRequestNumber: undefined },
        gitClient: createChangingReleaseGitClient(),
        packtory: createPacktoryWithPlan(
            fake.resolves({
                result: Result.ok({ packages: [ createReleasePackage() ] }),
                getReport() {
                    return createBuildReportFixture();
                }
            })
        ),
        ...overrides
    });
}

function createValidationFileManager(event: unknown): ReleasePullRequestHandlerDependencies['fileManager'] {
    return createFakeFileManager({
        simulatedReadFileResponses: [ { value: JSON.stringify(event) } ]
    });
}

export function createValidationEnvironment(
    eventName: string
): ReleasePullRequestHandlerDependencies['readEnvironmentVariable'] {
    return function (name) {
        return {
            GH_TOKEN: 'token',
            GITHUB_EVENT_NAME: eventName,
            GITHUB_EVENT_PATH: '/github-event.json',
            GITHUB_REPOSITORY: 'owner/repo',
            GITHUB_SHA: 'merge-sha'
        }[name];
    };
}

type ReleasePullRequestClientOverrides = Parameters<typeof createReleasePullRequestClient>[0];

export function createValidationDependencies(
    eventName: string,
    event: unknown,
    clientOverrides: ReleasePullRequestClientOverrides = {},
    overrides: Readonly<Partial<ReleasePullRequestHandlerDependencies>> = {}
): CreatedReleasePullRequestDependencies {
    return createDependencies({
        createReleasePullRequestGitHubClient: fake.returns(createReleasePullRequestClient(clientOverrides)),
        fileManager: createValidationFileManager(event),
        flags: { command: 'validate', releasePullRequestNumber: undefined },
        readEnvironmentVariable: createValidationEnvironment(eventName),
        ...overrides
    });
}

export function createMergedReleasePullRequestClient(): ReleasePullRequestGitHubClient {
    return createReleasePullRequestClient({
        listCommitPullRequests: fake.resolves([ {
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
        } ])
    });
}

export function createPullRequestHead(
    overrides: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> {
    return {
        author: 'github-actions[bot]',
        changedFiles: [ 'CHANGELOG.md' ],
        headRef: 'release/packtory',
        labels: [ 'release' ],
        parentShas: [ 'main-head' ],
        subject: 'Release packages',
        title: 'Prepare release',
        ...overrides
    };
}

type ReleasePullRequestUpdateAssertion = {
    readonly commit: ReturnType<typeof fake>;
    readonly createCommitOnBranch: ReturnType<typeof fake>;
    readonly createOrUpdateReleasePullRequest: ReturnType<typeof fake>;
    readonly log: ReturnType<typeof fake>;
    readonly readChangedFiles: ReturnType<typeof fake>;
    readonly pushHeadToBranch: ReturnType<typeof fake>;
    readonly pushFollowTags: ReturnType<typeof fake>;
};

export function assertReleasePullRequestWasUpdated(input: ReleasePullRequestUpdateAssertion): void {
    assert.strictEqual(input.commit.callCount, 1);
    assert.deepStrictEqual(input.readChangedFiles.firstCall.args, [ 'main-head', 'release-head' ]);
    assert.deepStrictEqual(input.createCommitOnBranch.firstCall.args[0], {
        additions: [
            {
                contents: Buffer.from('updated changelog\n', 'utf8').toString('base64'),
                path: 'CHANGELOG.md'
            }
        ],
        branch: 'release/packtory',
        expectedHeadOid: 'main-head',
        message: 'Release packages'
    });
    assert.strictEqual(input.pushHeadToBranch.callCount, 0);
    assert.strictEqual(input.pushFollowTags.callCount, 0);
    assert.deepStrictEqual(input.createOrUpdateReleasePullRequest.firstCall.args[0], {
        baseBranch: 'main',
        body: 'Updates changelogs for the next release.',
        label: 'release',
        releaseBranch: 'release/packtory',
        title: 'Prepare release'
    });
    assert.strictEqual(input.log.lastCall.args[0], 'Release PR #12 points at signed-release-head');
}
