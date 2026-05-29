import { isDefined } from 'remeda';
import { Octokit } from '@octokit/core';
import { paginateRest } from '@octokit/plugin-paginate-rest';
import { restEndpointMethods } from '@octokit/plugin-rest-endpoint-methods';
import {
    selectPullRequestActivityAt,
    type PullRequestActivity,
    type PullRequestTimelineEvent,
    type SuccessfulMainCiRun
} from './release-gate.ts';
import type { GitHubRepositoryContext } from './runner-config.ts';

type WorkflowRunsResponse = {
    readonly workflow_runs: readonly WorkflowRun[];
};

type WorkflowRun = {
    readonly conclusion: string | null;
    readonly event: string;
    readonly head_sha: string;
    readonly html_url: string;
    readonly updated_at: string;
};

type PullRequest = {
    readonly created_at: string;
    readonly html_url: string;
    readonly number: number;
};

type BranchResponse = {
    readonly commit: {
        readonly sha: string;
    };
};

type RawTimelineEvent = {
    readonly created_at?: string | null | undefined;
    readonly committer?: { readonly date: string } | undefined;
    readonly event?: string | undefined;
};

export type GitHubReleaseGateApi = {
    readonly getLatestSuccessfulMainCiRun: (
        ciWorkflowFile: string,
        headSha: string
    ) => Promise<SuccessfulMainCiRun | undefined>;
    readonly getMainBranchHeadSha: () => Promise<string>;
    readonly getOpenPullRequestActivities: () => Promise<readonly PullRequestActivity[]>;
};

function parseTimestamp(timestamp: string): Date {
    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
        throw new TypeError(`Invalid timestamp: ${timestamp}`);
    }

    return date;
}

type RepositoryRequestContext = {
    readonly headers: Readonly<Record<string, string>>;
    readonly owner: string;
    readonly repo: string;
};

async function requestGitHub<T>(request: Promise<T>): Promise<T> {
    try {
        return await request;
    } catch (error) {
        const requestUrl = String(Reflect.get(new Object(Reflect.get(new Object(error), 'request')), 'url'));
        const status = String(Reflect.get(new Object(error), 'status'));
        const parsedUrl = new URL(requestUrl);
        throw new Error(`GitHub API request failed (${status}) for ${parsedUrl.pathname}${parsedUrl.search}`, {
            cause: error
        });
    }
}

export function createGitHubReleaseGateApi(
    fetchImplementation: typeof globalThis.fetch,
    context: GitHubRepositoryContext
): GitHubReleaseGateApi {
    const GitHubRestClient = Octokit.plugin(restEndpointMethods, paginateRest);
    const requestContext: RepositoryRequestContext = {
        headers: {
            accept: 'application/vnd.github+json',
            authorization: `Bearer ${context.token}`,
            'user-agent': 'packtory-github-release-gate',
            'x-github-api-version': '2022-11-28'
        },
        owner: context.owner,
        repo: context.repo
    };
    const octokit = new GitHubRestClient({
        baseUrl: context.apiBaseUrl,
        request: {
            fetch: fetchImplementation,
            headers: requestContext.headers
        }
    });

    return {
        async getMainBranchHeadSha() {
            const branch = await requestGitHub<{ readonly data: BranchResponse }>(
                octokit.rest.repos.getBranch({
                    ...requestContext,
                    branch: context.defaultBranch
                })
            );

            return branch.data.commit.sha;
        },

        async getLatestSuccessfulMainCiRun(ciWorkflowFile, headSha) {
            const response = await requestGitHub<{ readonly data: WorkflowRunsResponse }>(
                octokit.rest.actions.listWorkflowRuns({
                    ...requestContext,
                    workflow_id: ciWorkflowFile,
                    branch: context.defaultBranch,
                    event: 'push',
                    head_sha: headSha,
                    status: 'completed',
                    per_page: 100
                })
            );
            const matchingRun = response.data.workflow_runs.find((run) => {
                return run.head_sha === headSha && run.conclusion === 'success' && run.event === 'push';
            });

            if (matchingRun === undefined) {
                return undefined;
            }

            return {
                htmlUrl: matchingRun.html_url,
                updatedAt: parseTimestamp(matchingRun.updated_at)
            };
        },

        async getOpenPullRequestActivities() {
            const openPullRequests = await requestGitHub<readonly PullRequest[]>(
                octokit.paginate(octokit.rest.pulls.list, {
                    ...requestContext,
                    state: 'open',
                    base: context.defaultBranch,
                    per_page: 100
                })
            );

            return Promise.all(
                openPullRequests.map(async (pullRequest) => {
                    const timeline = await requestGitHub<readonly RawTimelineEvent[]>(
                        octokit.paginate(octokit.rest.issues.listEventsForTimeline, {
                            ...requestContext,
                            issue_number: pullRequest.number,
                            per_page: 100
                        })
                    );
                    const timelineEvents = timeline
                        .map((event): PullRequestTimelineEvent | undefined => {
                            const timestamp =
                                event.event === 'committed' ? event.committer?.date : (event.created_at ?? undefined);
                            if (timestamp === undefined) {
                                return undefined;
                            }
                            return { createdAt: parseTimestamp(timestamp), event: event.event };
                        })
                        .filter(isDefined);

                    return {
                        number: pullRequest.number,
                        htmlUrl: pullRequest.html_url,
                        activityAt: selectPullRequestActivityAt(parseTimestamp(pullRequest.created_at), timelineEvents)
                    };
                })
            );
        }
    };
}
