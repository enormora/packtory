import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PullRequestDetails } from './release-pull-request-github-client.ts';
import {
    authorizeReleasePublishFromCommit,
    authorizeReleasePublishFromPullRequest
} from './release-publish-authorization.ts';
import type { ReleasePullRequestPolicyConfiguration } from './release-pull-request-policy.ts';

const policyConfiguration: ReleasePullRequestPolicyConfiguration = {
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
    baseReference: 'main',
    changedFiles: [ 'CHANGELOG.md' ],
    headReference: 'release/packtory',
    headRepository: 'owner/repo',
    labels: [ 'release' ],
    mergeCommitHash: 'merge-sha',
    merged: true,
    number: 12,
    subject: 'Release packages',
    title: 'Prepare release'
};

suite('release-publish-authorization', function () {
    test('skips normal commits without a release PR', function () {
        assert.deepStrictEqual(
            authorizeReleasePublishFromCommit({
                commitHash: 'commit-sha',
                configuration: policyConfiguration,
                pullRequests: [
                    {
                        ...releasePullRequest,
                        labels: [ 'bug' ],
                        mergeCommitHash: 'commit-sha'
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
                commitHash: 'merge-sha',
                configuration: policyConfiguration,
                pullRequests: [ releasePullRequest ],
                repository: 'owner/repo'
            }),
            {
                publishCommitHash: 'merge-sha',
                releaseCommitHash: 'merge-sha',
                releasePullRequestNumber: 12,
                shouldPublish: true
            }
        );
    });

    test('rejects commits associated with multiple release PRs', function () {
        assert.throws(
            function () {
                authorizeReleasePublishFromCommit({
                    commitHash: 'merge-sha',
                    configuration: policyConfiguration,
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
                    configuration: policyConfiguration,
                    pullRequest: {
                        ...releasePullRequest,
                        mergeCommitHash: undefined,
                        merged: false
                    },
                    repository: 'owner/repo'
                });
            },
            { message: 'Pull request #12 is not a merged release PR' }
        );
    });
});
