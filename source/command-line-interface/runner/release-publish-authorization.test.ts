import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PullRequestDetails } from './release-pr-github-client.ts';
import {
    authorizeReleasePublishFromCommit,
    authorizeReleasePublishFromPullRequest
} from './release-publish-authorization.ts';
import type { ReleasePullRequestPolicyConfig } from './release-pull-request-policy.ts';

const policyConfig: ReleasePullRequestPolicyConfig = {
    allowedFiles: new Set([ 'CHANGELOG.md' ]),
    automationAuthor: 'github-actions[bot]',
    branch: 'release/packtory',
    commitSubject: 'Release packages',
    defaultBranch: 'main',
    label: 'release',
    title: 'Prepare release'
};

const releasePullRequest: PullRequestDetails = {
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
};

suite('release-publish-authorization', function () {
    test('skips normal commits without a release PR', function () {
        assert.deepStrictEqual(
            authorizeReleasePublishFromCommit({
                commitSha: 'commit-sha',
                config: policyConfig,
                pullRequests: [
                    {
                        ...releasePullRequest,
                        labels: [ 'bug' ],
                        mergeCommitSha: 'commit-sha'
                    }
                ],
                repository: 'owner/repo'
            }),
            { shouldPublish: false }
        );
    });

    test('authorizes a commit associated with exactly one merged release PR', function () {
        assert.deepStrictEqual(
            authorizeReleasePublishFromCommit({
                commitSha: 'merge-sha',
                config: policyConfig,
                pullRequests: [ releasePullRequest ],
                repository: 'owner/repo'
            }),
            {
                publishCommitSha: 'merge-sha',
                releaseCommitSha: 'merge-sha',
                releasePullRequestNumber: 12,
                shouldPublish: true
            }
        );
    });

    test('rejects commits associated with multiple release PRs', function () {
        assert.throws(
            function () {
                authorizeReleasePublishFromCommit({
                    commitSha: 'merge-sha',
                    config: policyConfig,
                    pullRequests: [ releasePullRequest, { ...releasePullRequest, number: 13 } ],
                    repository: 'owner/repo'
                });
            },
            { message: 'Commit merge-sha is associated with multiple release PRs' }
        );
    });

    test('rejects manual retries for unmerged release PRs', function () {
        assert.throws(
            function () {
                authorizeReleasePublishFromPullRequest({
                    config: policyConfig,
                    pullRequest: {
                        ...releasePullRequest,
                        mergeCommitSha: undefined,
                        merged: false
                    },
                    repository: 'owner/repo'
                });
            },
            { message: 'Pull request #12 is not a merged release PR' }
        );
    });
});
