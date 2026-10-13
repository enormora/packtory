import type { PullRequestDetails } from './release-pull-request-github-client.ts';
import {
    validateReleasePullRequestPublishPolicy,
    type ReleasePullRequestPolicyConfiguration,
    type ReleasePullRequestPublishInput
} from './release-pull-request-policy.ts';

type AuthorizedReleasePublish = {
    readonly publishCommitHash: string;
    readonly releaseCommitHash: string;
    readonly releasePullRequestNumber: number;
    readonly shouldPublish: true;
};

export type ReleasePublishAuthorization = AuthorizedReleasePublish | { readonly shouldPublish: false; };

type PullRequestAuthorizationInput = {
    readonly configuration: ReleasePullRequestPolicyConfiguration;
    readonly expectedMergeCommitHash: string;
    readonly pullRequest: PullRequestDetails;
    readonly repository: string;
};
type CommitAuthorizationInput = {
    readonly configuration: ReleasePullRequestPolicyConfiguration;
    readonly commitHash: string;
    readonly pullRequests: readonly PullRequestDetails[];
    readonly repository: string;
};
type PullRequestPublishAuthorizationInput = {
    readonly configuration: ReleasePullRequestPolicyConfiguration;
    readonly pullRequest: PullRequestDetails;
    readonly repository: string;
};

function selectSingleReleasePullRequest(
    pullRequests: readonly PullRequestDetails[],
    commitHash: string
): PullRequestDetails | undefined {
    const pullRequest = pullRequests.at(0);
    const secondPullRequest = pullRequests.at(1);
    if (secondPullRequest !== undefined) {
        throw new Error(`Commit ${commitHash} is associated with multiple release PRs`);
    }
    return pullRequest;
}

function toPublishInput(pullRequest: PullRequestDetails, repository: string): ReleasePullRequestPublishInput {
    return {
        author: pullRequest.author,
        baseReference: pullRequest.baseReference,
        changedFiles: pullRequest.changedFiles,
        headReference: pullRequest.headReference,
        headRepository: pullRequest.headRepository,
        labels: pullRequest.labels,
        mergeCommitHash: pullRequest.mergeCommitHash,
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
            input.configuration,
            input.expectedMergeCommitHash
        );
    } catch {
        authorized = false;
    }
    return authorized;
}

export function authorizeReleasePublishFromCommit(input: CommitAuthorizationInput): ReleasePublishAuthorization {
    const releasePullRequests = input.pullRequests.filter(function (pullRequest) {
        return isAuthorizedPullRequest({
            configuration: input.configuration,
            expectedMergeCommitHash: input.commitHash,
            pullRequest,
            repository: input.repository
        });
    });

    const releasePullRequest = selectSingleReleasePullRequest(releasePullRequests, input.commitHash);
    if (releasePullRequest === undefined) {
        return { shouldPublish: false };
    }

    return {
        publishCommitHash: input.commitHash,
        releaseCommitHash: input.commitHash,
        releasePullRequestNumber: releasePullRequest.number,
        shouldPublish: true
    };
}

export function authorizeReleasePublishFromPullRequest(
    input: PullRequestPublishAuthorizationInput
): ReleasePublishAuthorization {
    if (input.pullRequest.mergeCommitHash === undefined) {
        throw new Error(`Pull request #${input.pullRequest.number} is not a merged release PR`);
    }

    validateReleasePullRequestPublishPolicy(
        toPublishInput(input.pullRequest, input.repository),
        input.configuration,
        input.pullRequest.mergeCommitHash
    );

    return {
        publishCommitHash: input.pullRequest.mergeCommitHash,
        releaseCommitHash: input.pullRequest.mergeCommitHash,
        releasePullRequestNumber: input.pullRequest.number,
        shouldPublish: true
    };
}
