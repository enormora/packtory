import type { ReleasePullRequestConfig } from './release-pull-request-config.ts';

export type ReleasePullRequestPolicyInput = {
    readonly author: string;
    readonly changedFiles: readonly string[];
    readonly expectedBaseSha: string;
    readonly headRef: string;
    readonly labels: readonly string[];
    readonly parentShas: readonly string[];
    readonly subject: string;
    readonly title: string;
};

type ReleasePullRequestShape = Pick<
    ReleasePullRequestPolicyInput,
    'author' | 'changedFiles' | 'headRef' | 'labels' | 'subject' | 'title'
>;

export type ReleasePullRequestPublishInput = ReleasePullRequestShape & {
    readonly baseRef: string;
    readonly headRepository: string;
    readonly mergeCommitSha: string | undefined;
    readonly merged: boolean;
    readonly repository: string;
};

export type ReleasePullRequestPolicyConfig = Pick<
    ReleasePullRequestConfig,
    'automationAuthor' | 'branch' | 'commitSubject' | 'defaultBranch' | 'label' | 'title'
> & {
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

function validateReleaseLabelSet(labels: readonly string[], config: ReleasePullRequestPolicyConfig): void {
    requirePolicy(
        labels.length === 1 && labels[0] === config.label,
        `Release PRs must only have the ${config.label} label`
    );
}

function validateReleaseChangedFiles(changedFiles: readonly string[], config: ReleasePullRequestPolicyConfig): void {
    requirePolicy(changedFiles.length > 0, 'Release PRs must change release output files');

    for (const changedFile of changedFiles) {
        requirePolicy(config.allowedFiles.has(changedFile), `Unexpected release PR file change: ${changedFile}`);
    }
}

function validateReleaseIdentity(
    input: Pick<ReleasePullRequestPolicyInput, 'author' | 'headRef' | 'labels' | 'subject' | 'title'>,
    config: ReleasePullRequestPolicyConfig
): void {
    validateReleaseLabelSet(input.labels, config);
    requirePolicy(
        input.author === config.automationAuthor,
        `Release PRs must be authored by ${config.automationAuthor}`
    );
    requirePolicy(input.headRef === config.branch, `Release PRs must use ${config.branch}`);
    requirePolicy(input.title === config.title, `Release PR title must be ${config.title}`);
    requirePolicy(input.subject === config.commitSubject, `Release PR commit subject must be ${config.commitSubject}`);
}

export function validateReleasePullRequestPolicy(
    input: ReleasePullRequestPolicyInput,
    config: ReleasePullRequestPolicyConfig
): void {
    validateReleaseIdentity(input, config);
    requirePolicy(input.parentShas.length === 1, 'Release PR head must have exactly one parent');
    requirePolicy(input.parentShas[0] === input.expectedBaseSha, 'Release PR head must be based on expected main');
    validateReleaseChangedFiles(input.changedFiles, config);
}

export function validateReleasePullRequestPublishPolicy(
    input: ReleasePullRequestPublishInput,
    config: ReleasePullRequestPolicyConfig,
    expectedMergeCommitSha: string
): void {
    validateReleaseIdentity(input, config);
    requirePolicy(input.baseRef === config.defaultBranch, `Release PR base must be ${config.defaultBranch}`);
    requirePolicy(input.headRepository === input.repository, 'Release PRs must come from the release repository');
    requirePolicy(input.merged, 'Release PR must be merged');
    requirePolicy(
        input.mergeCommitSha === expectedMergeCommitSha,
        `Release PR merge commit must be ${expectedMergeCommitSha}`
    );
    validateReleaseChangedFiles(input.changedFiles, config);
}

export function validateReleaseMergeGroupPolicy(
    input: MergeGroupPolicyInput,
    config: ReleasePullRequestPolicyConfig
): void {
    const releasePullRequests = input.pullRequests.filter((pullRequest) => {
        return pullRequest.labels.includes(config.label);
    });

    if (releasePullRequests.length > 0 && input.pullRequests.length !== 1) {
        throw new Error('Release PRs must not be grouped with other pull requests');
    }

    for (const pullRequest of releasePullRequests) {
        validateReleasePullRequestPolicy(pullRequest, config);
    }
}
