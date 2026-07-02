import { isDefined } from 'remeda';
import { Octokit } from '@octokit/core';
import { paginateRest } from '@octokit/plugin-paginate-rest';
import { restEndpointMethods } from '@octokit/plugin-rest-endpoint-methods';
import {
    selectPullRequestActivityAt,
    type MainCiRunStatus,
    type PullRequestActivity,
    type PullRequestTimelineEvent
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
    readonly status: string | null;
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
    readonly committer?: { readonly date: string; } | undefined;
    readonly event?: string | undefined;
};

export type GitHubReleaseGateApi = {
    readonly getMainBranchHeadSha: () => Promise<string>;
    readonly getMainCiRunStatus: (ciWorkflowFile: string, headSha: string) => Promise<MainCiRunStatus>;
    readonly getOpenPullRequestActivities: () => Promise<readonly PullRequestActivity[]>;
};

function parseTimestamp(timestamp: string): Date {
    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
        throw new TypeError(`Invalid timestamp: ${timestamp}`);
    }

    return date;
}

function readReflectedProperty(value: unknown, property: string): unknown {
    return Reflect.get(new Object(value), property) as unknown;
}

function createGitHubRequestError(error: unknown): Error {
    const requestUrl = String(readReflectedProperty(readReflectedProperty(error, 'request'), 'url'));
    const status = String(readReflectedProperty(error, 'status'));
    const parsedUrl = new URL(requestUrl);
    return new Error(`GitHub API request failed (${status}) for ${parsedUrl.pathname}${parsedUrl.search}`, {
        cause: error
    });
}

async function resolveGitHubResponse<T>(request: Promise<T>): Promise<T> {
    try {
        return await request;
    } catch (error) {
        throw createGitHubRequestError(error);
    }
}

type RepositoryRequestContext = {
    readonly headers: Readonly<Record<string, string>>;
    readonly owner: string;
    readonly repo: string;
};

function createRequestHeaders(context: GitHubRepositoryContext): Readonly<Record<string, string>> {
    return {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${context.token}`,
        'user-agent': 'packtory-github-release-gate',
        'x-github-api-version': '2022-11-28'
    };
}

export function createGitHubReleaseGateApi(
    fetchImplementation: typeof globalThis.fetch,
    context: GitHubRepositoryContext
): GitHubReleaseGateApi {
    const GitHubRestClient = Octokit.plugin(restEndpointMethods, paginateRest);
    const requestContext: RepositoryRequestContext = {
        headers: createRequestHeaders(context),
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
            const branch = await resolveGitHubResponse<{ readonly data: BranchResponse; }>(
                octokit.rest.repos.getBranch({
                    ...requestContext,
                    branch: context.defaultBranch
                })
            );

            return branch.data.commit.sha;
        },

        async getMainCiRunStatus(ciWorkflowFile, headSha) {
            const response = await resolveGitHubResponse<{ readonly data: WorkflowRunsResponse; }>(
                octokit.rest.actions.listWorkflowRuns({
                    ...requestContext,
                    workflow_id: ciWorkflowFile,
                    branch: context.defaultBranch,
                    event: 'push',
                    head_sha: headSha,
                    per_page: 100
                })
            );
            const matchingRuns = response.data.workflow_runs.filter(function (run) {
                return run.head_sha === headSha && run.event === 'push';
            });
            const successfulRun = matchingRuns.find(function (run) {
                return run.conclusion === 'success';
            });

            if (successfulRun !== undefined) {
                return {
                    kind: 'success',
                    run: {
                        htmlUrl: successfulRun.html_url,
                        updatedAt: parseTimestamp(successfulRun.updated_at)
                    }
                };
            }

            const inProgressRun = matchingRuns.find(function (run) {
                return run.status !== 'completed';
            });

            if (inProgressRun !== undefined) {
                return { kind: 'in_progress' };
            }

            return { kind: 'missing' };
        },

        async getOpenPullRequestActivities() {
            const openPullRequests = await resolveGitHubResponse<readonly PullRequest[]>(
                octokit.paginate(octokit.rest.pulls.list, {
                    ...requestContext,
                    state: 'open',
                    base: context.defaultBranch,
                    per_page: 100
                })
            );

            return Promise.all(
                openPullRequests.map(async function (pullRequest) {
                    const timeline = await resolveGitHubResponse<readonly RawTimelineEvent[]>(
                        octokit.paginate(octokit.rest.issues.listEventsForTimeline, {
                            ...requestContext,
                            issue_number: pullRequest.number,
                            per_page: 100
                        })
                    );
                    const timelineEvents = timeline
                        .map(function (event): PullRequestTimelineEvent | undefined {
                            const timestamp = event.event === 'committed'
                                ? event.committer?.date
                                : event.created_at ?? undefined;
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
