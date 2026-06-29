import type { PullRequestDetails } from './release-pr-github-client.ts';
import {
    validateReleasePullRequestPublishPolicy,
    type ReleasePullRequestPolicyConfig,
    type ReleasePullRequestPublishInput
} from './release-pull-request-policy.ts';

type AuthorizedReleasePublish = {
    readonly publishCommitSha: string;
    readonly releaseCommitSha: string;
    readonly releasePullRequestNumber: number;
    readonly shouldPublish: true;
};

export type ReleasePublishAuthorization = AuthorizedReleasePublish | { readonly shouldPublish: false; };

type PullRequestAuthorizationInput = {
    readonly config: ReleasePullRequestPolicyConfig;
    readonly expectedMergeCommitSha: string;
    readonly pullRequest: PullRequestDetails;
    readonly repository: string;
};
type CommitAuthorizationInput = {
    readonly config: ReleasePullRequestPolicyConfig;
    readonly commitSha: string;
    readonly pullRequests: readonly PullRequestDetails[];
    readonly repository: string;
};
type PullRequestPublishAuthorizationInput = {
    readonly config: ReleasePullRequestPolicyConfig;
    readonly pullRequest: PullRequestDetails;
    readonly repository: string;
};

function selectSingleReleasePullRequest(
    pullRequests: readonly PullRequestDetails[],
    commitSha: string
): PullRequestDetails | undefined {
    const pullRequest = pullRequests.at(0);
    const secondPullRequest = pullRequests.at(1);
    if (secondPullRequest !== undefined) {
        throw new Error(`Commit ${commitSha} is associated with multiple release PRs`);
    }
    return pullRequest;
}

function toPublishInput(pullRequest: PullRequestDetails, repository: string): ReleasePullRequestPublishInput {
    return {
        author: pullRequest.author,
        baseRef: pullRequest.baseRef,
        changedFiles: pullRequest.changedFiles,
        headRef: pullRequest.headRef,
        headRepository: pullRequest.headRepository,
        labels: pullRequest.labels,
        mergeCommitSha: pullRequest.mergeCommitSha,
        merged: pullRequest.merged,
        repository,
        subject: pullRequest.subject,
        title: pullRequest.title
    };
}

function isAuthorizedPullRequest(input: PullRequestAuthorizationInput): boolean {
    let authorized = true;
    try {
        validateReleasePullRequestPublishPolicy(
            toPublishInput(input.pullRequest, input.repository),
            input.config,
            input.expectedMergeCommitSha
        );
    } catch {
        authorized = false;
    }
    return authorized;
}

export function authorizeReleasePublishFromCommit(input: CommitAuthorizationInput): ReleasePublishAuthorization {
    const releasePullRequests = input.pullRequests.filter(function (pullRequest) {
        return isAuthorizedPullRequest({
            config: input.config,
            expectedMergeCommitSha: input.commitSha,
            pullRequest,
            repository: input.repository
        });
    });

    const releasePullRequest = selectSingleReleasePullRequest(releasePullRequests, input.commitSha);
    if (releasePullRequest === undefined) {
        return { shouldPublish: false };
    }

    return {
        publishCommitSha: input.commitSha,
        releaseCommitSha: input.commitSha,
        releasePullRequestNumber: releasePullRequest.number,
        shouldPublish: true
    };
}

export function authorizeReleasePublishFromPullRequest(
    input: PullRequestPublishAuthorizationInput
): ReleasePublishAuthorization {
    if (input.pullRequest.mergeCommitSha === undefined) {
        throw new Error(`Pull request #${input.pullRequest.number} is not a merged release PR`);
    }

    validateReleasePullRequestPublishPolicy(
        toPublishInput(input.pullRequest, input.repository),
        input.config,
        input.pullRequest.mergeCommitSha
    );

    return {
        publishCommitSha: input.pullRequest.mergeCommitSha,
        releaseCommitSha: input.pullRequest.mergeCommitSha,
        releasePullRequestNumber: input.pullRequest.number,
        shouldPublish: true
    };
}
