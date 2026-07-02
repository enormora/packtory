import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    validateReleaseMergeGroupPolicy,
    validateReleasePullRequestPolicy,
    validateReleasePullRequestPublishPolicy,
    type ReleasePullRequestPolicyConfig,
    type ReleasePullRequestPolicyInput,
    type ReleasePullRequestPublishInput
} from './release-pull-request-policy.ts';

const policyConfig: ReleasePullRequestPolicyConfig = {
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
    expectedBaseSha: 'main-head',
    headRef: 'release/packtory',
    labels: [ 'release' ],
    parentShas: [ 'main-head' ],
    subject: 'Release packages',
    title: 'Prepare release'
};

const validPublishInput: ReleasePullRequestPublishInput = {
    author: 'github-actions[bot]',
    baseRef: 'main',
    changedFiles: [ 'CHANGELOG.md' ],
    headRef: 'release/packtory',
    headRepository: 'owner/repo',
    labels: [ 'release' ],
    mergeCommitSha: 'merge-sha',
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
        assert.doesNotThrow(function () {
            validateReleasePullRequestPolicy(validPullRequest, policyConfig);
        });
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
                [ { ...validPullRequest, headRef: 'feature' }, 'Release PRs must use release/packtory' ],
                [ { ...validPullRequest, title: 'Release' }, 'Release PR title must be Prepare release' ],
                [
                    { ...validPullRequest, subject: 'Update changelogs' },
                    'Release PR commit subject must be Release packages'
                ],
                [
                    { ...validPullRequest, parentShas: [ 'old-head' ] },
                    'Release PR head must be based on expected main'
                ],
                [
                    { ...validPullRequest, parentShas: [ 'main-head', 'other-head' ] },
                    'Release PR head must have exactly one parent'
                ],
                [
                    { ...validPullRequest, labels: [ 'release', 'bug' ] },
                    'Release PRs must only have the release label'
                ]
            ] as const
        ) {
            assertPolicyError(function () {
                validateReleasePullRequestPolicy(pullRequest, policyConfig);
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
                policyConfig
            );
        }, 'Release PRs must not be grouped with other pull requests');
    });

    test('accepts merge groups that contain only the release pull request', function () {
        assert.doesNotThrow(function () {
            validateReleaseMergeGroupPolicy({ pullRequests: [ validPullRequest ] }, policyConfig);
        });
    });

    test('rejects merge groups with invalid release pull requests', function () {
        assertPolicyError(function () {
            validateReleaseMergeGroupPolicy(
                {
                    pullRequests: [
                        {
                            ...validPullRequest,
                            changedFiles: [ 'src/index.ts' ]
                        }
                    ]
                },
                policyConfig
            );
        }, 'Unexpected release PR file change: src/index.ts');
    });

    test('accepts a merged release PR publish target', function () {
        assert.doesNotThrow(function () {
            validateReleasePullRequestPublishPolicy(validPublishInput, policyConfig, 'merge-sha');
        });
    });

    test('rejects publish targets that violate the policy', function () {
        for (
            const [ publishInput, mergeCommitSha, expectedMessage ] of [
                [
                    { ...validPublishInput, headRepository: 'other/repo' },
                    'merge-sha',
                    'Release PRs must come from the release repository'
                ],
                [ { ...validPublishInput, baseRef: 'next' }, 'merge-sha', 'Release PR base must be main' ],
                [ { ...validPublishInput, merged: false }, 'merge-sha', 'Release PR must be merged' ],
                [ validPublishInput, 'other-sha', 'Release PR merge commit must be other-sha' ]
            ] as const
        ) {
            assertPolicyError(function () {
                validateReleasePullRequestPublishPolicy(publishInput, policyConfig, mergeCommitSha);
            }, expectedMessage);
        }
    });

    test('accepts merge groups without release pull requests', function () {
        assert.doesNotThrow(function () {
            validateReleaseMergeGroupPolicy(
                {
                    pullRequests: [
                        { ...validPullRequest, labels: [ 'bug' ] },
                        { ...validPullRequest, labels: [ 'feature' ] }
                    ]
                },
                policyConfig
            );
        });
    });
});
