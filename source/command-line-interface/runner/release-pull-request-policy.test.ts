import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    validateReleaseMergeGroupPolicy,
    validateReleasePullRequestPolicy,
    validateReleasePullRequestPublishPolicy,
    type ReleasePullRequestPolicyConfiguration,
    type ReleasePullRequestPolicyInput,
    type ReleasePullRequestPublishInput
} from './release-pull-request-policy.ts';

const policyConfiguration: ReleasePullRequestPolicyConfiguration = {
    allowedFiles: new Set([ 'CHANGELOG.md' ]),
    automationAuthor: 'github-actions[bot]',
    branch: 'release/packtory',
    commitSubject: 'Release packages',
    defaultBranch: 'main',
    label: 'release',
    title: 'Prepare release'
};

const validPullRequest: ReleasePullRequestPolicyInput = {
    author: 'github-actions[bot]',
    changedFiles: [ 'CHANGELOG.md' ],
    expectedBaseHash: 'main-head',
    headReference: 'release/packtory',
    labels: [ 'release' ],
    parentHashes: [ 'main-head' ],
    subject: 'Release packages',
    title: 'Prepare release'
};

const validPublishInput: ReleasePullRequestPublishInput = {
    author: 'github-actions[bot]',
    baseReference: 'main',
    changedFiles: [ 'CHANGELOG.md' ],
    headReference: 'release/packtory',
    headRepository: 'owner/repo',
    labels: [ 'release' ],
    mergeCommitHash: 'merge-sha',
    merged: true,
    repository: 'owner/repo',
    subject: 'Release packages',
    title: 'Prepare release'
};

function assertPolicyError(validate: () => void, expectedMessage: string): void {
    assert.throws(validate, { message: expectedMessage });
}

suite('release-pull-request-policy', function () {
    test('accepts a valid release pull request', function () {
        validateReleasePullRequestPolicy(validPullRequest, policyConfiguration);

        assert.strictEqual(validPullRequest.headReference, 'release/packtory');
    });

    test('rejects release pull requests that violate the policy', function () {
        for (
            const [ pullRequest, expectedMessage ] of [
                [
                    { ...validPullRequest, changedFiles: [ 'source/index.ts' ] },
                    'Unexpected release PR file change: source/index.ts'
                ],
                [ { ...validPullRequest, changedFiles: [] }, 'Release PRs must change release output files' ],
                [
                    { ...validPullRequest, author: 'maintainer' },
                    'Release PRs must be authored by github-actions[bot]'
                ],
                [ { ...validPullRequest, headReference: 'feature' }, 'Release PRs must use release/packtory' ],
                [ { ...validPullRequest, title: 'Release' }, 'Release PR title must be Prepare release' ],
                [
                    { ...validPullRequest, subject: 'Update changelogs' },
                    'Release PR commit subject must be Release packages'
                ],
                [
                    { ...validPullRequest, parentHashes: [ 'old-head' ] },
                    'Release PR head must be based on expected main'
                ],
                [
                    { ...validPullRequest, parentHashes: [ 'main-head', 'other-head' ] },
                    'Release PR head must have exactly one parent'
                ],
                [
                    { ...validPullRequest, labels: [ 'release', 'bug' ] },
                    'Release PRs must only have the release label'
                ]
            ] as const
        ) {
            assertPolicyError(function () {
                validateReleasePullRequestPolicy(pullRequest, policyConfiguration);
            }, expectedMessage);
        }
    });

    test('rejects merge groups that batch release PRs with other pull requests', function () {
        assertPolicyError(function () {
            validateReleaseMergeGroupPolicy(
                {
                    pullRequests: [
                        validPullRequest,
                        {
                            ...validPullRequest,
                            labels: [ 'bug' ]
                        }
                    ]
                },
                policyConfiguration
            );
        }, 'Release PRs must not be grouped with other pull requests');
    });

    test('accepts merge groups that contain only the release pull request', function () {
        validateReleaseMergeGroupPolicy({ pullRequests: [ validPullRequest ] }, policyConfiguration);

        assert.deepStrictEqual(validPullRequest.labels, [ 'release' ]);
    });

    test('rejects merge groups with invalid release pull requests', function () {
        assertPolicyError(function () {
            validateReleaseMergeGroupPolicy(
                {
                    pullRequests: [
                        {
                            ...validPullRequest,
                            changedFiles: [ 'source/index.ts' ]
                        }
                    ]
                },
                policyConfiguration
            );
        }, 'Unexpected release PR file change: source/index.ts');
    });

    test('accepts a merged release PR publish target', function () {
        validateReleasePullRequestPublishPolicy(validPublishInput, policyConfiguration, 'merge-sha');

        assert.strictEqual(validPublishInput.mergeCommitHash, 'merge-sha');
    });

    test('rejects publish targets that violate the policy', function () {
        for (
            const [ publishInput, mergeCommitHash, expectedMessage ] of [
                [
                    { ...validPublishInput, headRepository: 'other/repo' },
                    'merge-sha',
                    'Release PRs must come from the release repository'
                ],
                [ { ...validPublishInput, baseReference: 'next' }, 'merge-sha', 'Release PR base must be main' ],
                [ { ...validPublishInput, merged: false }, 'merge-sha', 'Release PR must be merged' ],
                [ validPublishInput, 'other-sha', 'Release PR merge commit must be other-sha' ]
            ] as const
        ) {
            assertPolicyError(function () {
                validateReleasePullRequestPublishPolicy(publishInput, policyConfiguration, mergeCommitHash);
            }, expectedMessage);
        }
    });

    test('accepts merge groups without release pull requests', function () {
        validateReleaseMergeGroupPolicy(
            {
                pullRequests: [
                    { ...validPullRequest, labels: [ 'bug' ] },
                    { ...validPullRequest, labels: [ 'feature' ] }
                ]
            },
            policyConfiguration
        );

        assert.strictEqual(policyConfiguration.label, 'release');
    });
});
