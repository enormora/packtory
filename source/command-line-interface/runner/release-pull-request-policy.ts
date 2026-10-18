import type { ReleasePullRequestConfiguration } from './release-pull-request-configuration.ts';

export type ReleasePullRequestPolicyInput = {
    readonly author: string;
    readonly changedFiles: readonly string[];
    readonly expectedBaseHash: string;
    readonly headReference: string;
    readonly labels: readonly string[];
    readonly parentHashes: readonly string[];
    readonly subject: string;
    readonly title: string;
};

type ReleasePullRequestShape = Pick<
    ReleasePullRequestPolicyInput,
    'author' | 'changedFiles' | 'headReference' | 'labels' | 'subject' | 'title'
>;
type ReleasePullRequestPolicyConfigurationShape = Pick<
    ReleasePullRequestConfiguration,
    'automationAuthor' | 'branch' | 'commitSubject' | 'defaultBranch' | 'label' | 'title'
>;

export type ReleasePullRequestPublishInput = ReleasePullRequestShape & {
    readonly baseReference: string;
    readonly headRepository: string;
    readonly mergeCommitHash: string | undefined;
    readonly merged: boolean;
    readonly repository: string;
};

export type ReleasePullRequestPolicyConfiguration = ReleasePullRequestPolicyConfigurationShape & {
    readonly allowedFiles: ReadonlySet<string>;
};

type MergeGroupPolicyInput = {
    readonly pullRequests: readonly ReleasePullRequestPolicyInput[];
};

function requirePolicy(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(message);
    }
}

function validateReleaseLabelSet(
    labels: readonly string[],
    configuration: ReleasePullRequestPolicyConfiguration
): void {
    requirePolicy(
        labels.length === 1 && labels[0] === configuration.label,
        `Release PRs must only have the ${configuration.label} label`
    );
}

function validateReleaseChangedFiles(
    changedFiles: readonly string[],
    configuration: ReleasePullRequestPolicyConfiguration
): void {
    requirePolicy(changedFiles.length > 0, 'Release PRs must change release output files');

    for (const changedFile of changedFiles) {
        requirePolicy(configuration.allowedFiles.has(changedFile), `Unexpected release PR file change: ${changedFile}`);
    }
}

function validateReleaseIdentity(
    input: Pick<ReleasePullRequestPolicyInput, 'author' | 'headReference' | 'labels' | 'subject' | 'title'>,
    configuration: ReleasePullRequestPolicyConfiguration
): void {
    validateReleaseLabelSet(input.labels, configuration);
    requirePolicy(
        input.author === configuration.automationAuthor,
        `Release PRs must be authored by ${configuration.automationAuthor}`
    );
    requirePolicy(input.headReference === configuration.branch, `Release PRs must use ${configuration.branch}`);
    requirePolicy(input.title === configuration.title, `Release PR title must be ${configuration.title}`);
    requirePolicy(
        input.subject === configuration.commitSubject,
        `Release PR commit subject must be ${configuration.commitSubject}`
    );
}

export function validateReleasePullRequestPolicy(
    input: ReleasePullRequestPolicyInput,
    configuration: ReleasePullRequestPolicyConfiguration
): void {
    validateReleaseIdentity(input, configuration);
    requirePolicy(input.parentHashes.length === 1, 'Release PR head must have exactly one parent');
    requirePolicy(input.parentHashes[0] === input.expectedBaseHash, 'Release PR head must be based on expected main');
    validateReleaseChangedFiles(input.changedFiles, configuration);
}

export function validateReleasePullRequestPublishPolicy(
    input: ReleasePullRequestPublishInput,
    configuration: ReleasePullRequestPolicyConfiguration,
    expectedMergeCommitHash: string
): void {
    validateReleaseIdentity(input, configuration);
    requirePolicy(
        input.baseReference === configuration.defaultBranch,
        `Release PR base must be ${configuration.defaultBranch}`
    );
    requirePolicy(input.headRepository === input.repository, 'Release PRs must come from the release repository');
    requirePolicy(input.merged, 'Release PR must be merged');
    requirePolicy(
        input.mergeCommitHash === expectedMergeCommitHash,
        `Release PR merge commit must be ${expectedMergeCommitHash}`
    );
    validateReleaseChangedFiles(input.changedFiles, configuration);
}

export function validateReleaseMergeGroupPolicy(
    input: MergeGroupPolicyInput,
    configuration: ReleasePullRequestPolicyConfiguration
): void {
    const releasePullRequests = input.pullRequests.filter(function (pullRequest) {
        return pullRequest.labels.includes(configuration.label);
    });

    if (releasePullRequests.length > 0 && input.pullRequests.length !== 1) {
        throw new Error('Release PRs must not be grouped with other pull requests');
    }

    for (const pullRequest of releasePullRequests) {
        validateReleasePullRequestPolicy(pullRequest, configuration);
    }
}
