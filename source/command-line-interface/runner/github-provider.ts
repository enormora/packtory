import { Octokit } from '@octokit/core';
import { paginateRest as paginateRequests } from '@octokit/plugin-paginate-rest';
import { restEndpointMethods as endpointMethods } from '@octokit/plugin-rest-endpoint-methods';
import { isDefined } from 'remeda';
import { toGitHubRequest } from '../../common/github-request.ts';

type GitHubLabel = { readonly name?: string | null | undefined; };

export type GitHubPullRequest = {
    readonly base: { readonly ref: string; };
    readonly head: {
        readonly ref: string;
        readonly repo: { readonly full_name: string | null; } | null;
        readonly sha: string;
    };
    readonly labels: readonly GitHubLabel[];
    readonly merge_commit_sha: string | null;
    readonly merged_at?: string | null | undefined;
    readonly number: number;
    readonly title: string;
    readonly user: { readonly login: string; } | null;
};

export type GitHubCommit = {
    readonly commit: { readonly message: string; };
    readonly parents: readonly { readonly sha: string; }[];
};

type GitHubProviderConstructor = ReturnType<
    typeof Octokit.plugin<typeof Octokit, [typeof endpointMethods, typeof paginateRequests]>
>;

export type GitHubProvider = InstanceType<GitHubProviderConstructor>;

export function readLabelNames(labels: readonly GitHubLabel[]): readonly string[] {
    return labels
        .map(function (label) {
            return label.name ?? undefined;
        })
        .filter(isDefined);
}

export function readCommitSubject(commit: GitHubCommit): string {
    const firstLineBreak = commit.commit.message.indexOf('\n');
    if (firstLineBreak === -1) {
        return commit.commit.message;
    }
    return commit.commit.message.slice(0, firstLineBreak);
}

export function isMergedPullRequest(pullRequest: GitHubPullRequest): boolean {
    return pullRequest.merged_at !== undefined && pullRequest.merged_at !== null;
}
type GitHubProviderSettings = {
    readonly baseAddress: string;
    readonly fetch: typeof globalThis.fetch;
    readonly headers: Readonly<Record<string, string>>;
};
export function createGitHubProvider(settings: GitHubProviderSettings): GitHubProvider {
    const Provider = Octokit.plugin(endpointMethods, paginateRequests);
    return new Provider(
        toGitHubRequest({
            baseAddress: settings.baseAddress,
            request: { fetch: settings.fetch, headers: settings.headers }
        })
    );
}
