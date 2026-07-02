import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { createFakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import {
    createDependencies,
    createMergedReleasePullRequestClient
} from '../../test-libraries/release-pull-request-handler-test-support.ts';
import { createReleasePullRequestClient } from '../../test-libraries/runner-test-support.ts';
import { runReleasePullRequestHandler } from './release-pull-request-handler.ts';

suite('authorize publish', function () {
    test('authorize-publish logs publish authorization when GitHub output is absent', async function () {
        const { dependencies, log } = createDependencies({
            createReleasePullRequestGitHubClient: fake.returns(createMergedReleasePullRequestClient())
        });

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
        assert.deepStrictEqual(
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

    test('authorize-publish appends publish authorization to GitHub output', async function () {
        const fileManager = createFakeFileManager({ simulatedReadFileResponses: [ { value: 'existing=true\n' } ] });
        const { dependencies } = createDependencies({
            createReleasePullRequestGitHubClient: fake.returns(createMergedReleasePullRequestClient()),
            fileManager,
            readEnvironmentVariable(name) {
                return {
                    GH_TOKEN: 'token',
                    GITHUB_OUTPUT: '/github-output',
                    GITHUB_REPOSITORY: 'owner/repo',
                    GITHUB_SHA: 'merge-sha'
                }[name];
            }
        });

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
        assert.deepStrictEqual(fileManager.getWriteFileCall(0), {
            filePath: '/github-output',
            content: [
                'existing=true',
                'should_publish=true',
                'publish_commit_sha=merge-sha',
                'release_commit_sha=merge-sha',
                'release_pull_request_number=12',
                ''
            ]
                .join('\n')
        });
    });

    test('authorize-publish writes skipped publish decisions for non-release commits', async function () {
        const listCommitPullRequests = fake.resolves([]);
        const fileManager = createFakeFileManager({
            simulatedReadFileResponses: [ { error: Object.assign(new Error('missing'), { code: 'ENOENT' }) } ]
        });
        const { dependencies } = createDependencies({
            createReleasePullRequestGitHubClient: fake.returns(
                createReleasePullRequestClient({ listCommitPullRequests })
            ),
            fileManager,
            readEnvironmentVariable(name) {
                return {
                    GH_TOKEN: 'token',
                    GITHUB_OUTPUT: '/github-output',
                    GITHUB_REPOSITORY: 'owner/repo',
                    GITHUB_SHA: 'feature-sha'
                }[name];
            }
        });

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 0);
        assert.deepStrictEqual(fileManager.getWriteFileCall(0), {
            filePath: '/github-output',
            content: 'should_publish=false\n'
        });
    });

    test('authorize-publish rejects manual retries from non-default branches', async function () {
        const { dependencies, log } = createDependencies({
            flags: { command: 'authorize-publish', releasePullRequestNumber: '12' },
            readEnvironmentVariable(name) {
                return {
                    GH_TOKEN: 'token',
                    GITHUB_REF_NAME: 'feature',
                    GITHUB_REPOSITORY: 'owner/repo',
                    GITHUB_SHA: 'merge-sha'
                }[name];
            }
        });

        assert.strictEqual(await runReleasePullRequestHandler(dependencies), 1);
        assert.strictEqual(log.lastCall.args[0], 'Manual release publish retries must run from main');
    });
});
