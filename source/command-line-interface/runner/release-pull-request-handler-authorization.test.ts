import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { createFakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import {
    assertHandlerFailure,
    createDependencies,
    createGitHubEnvironment,
    createReleasePullRequestClient,
    createReleasePullRequestDetails,
    type CreatedReleasePullRequestDependencies
} from '../../test-libraries/release-pull-request-handler-test-support.ts';
import { runReleasePullRequestHandler } from './release-pull-request-handler.ts';

function createManualAuthorizationDependencies(
    fileManager = createFakeFileManager()
): CreatedReleasePullRequestDependencies {
    return createDependencies({
        fileManager,
        flags: { command: 'authorize-publish', releasePullRequestNumber: '12' },
        readEnvironmentVariable: createGitHubEnvironment({
            GITHUB_OUTPUT: '/github-output',
            GITHUB_REF_NAME: 'main'
        })
    });
}

type AuthorizePublishEnvironment = Readonly<
    Record<'GH_TOKEN' | 'GITHUB_REPOSITORY' | 'GITHUB_SHA', string | undefined>
>;

function createAuthorizePublishEnvironment(input: AuthorizePublishEnvironment): (name: string) => string | undefined {
    return function (name: string) {
        return input[name as keyof AuthorizePublishEnvironment];
    };
}

suite('release-pull-request-handler authorization', function () {
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
            ]
                .join('\n')
        );
    });

    test('authorize-publish writes GitHub output when no previous output file is readable', async function () {
        const fileManager = createFakeFileManager({
            simulatedReadFileResponses: [ { error: new Error('missing output') } ]
        });
        const { dependencies } = createManualAuthorizationDependencies(fileManager);

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
        assert.strictEqual(fileManager.getWriteFileCall(0).content.startsWith('should_publish=true\n'), true);
    });

    test('authorize-publish appends to existing GitHub output', async function () {
        const fileManager = createFakeFileManager({
            simulatedReadFileResponses: [ { value: 'existing=true\n' } ]
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
                    listCommitPullRequests: fake.resolves([ createReleasePullRequestDetails() ])
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
            ]
                .join('\n')
        );
    });

    test('rejects malformed GitHub repository environment values', async function () {
        for (const repository of [ 'owner', '', '/repo', 'owner/', 'owner/repo/extra' ]) {
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
        for (const commitSha of [ undefined, '' ]) {
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
