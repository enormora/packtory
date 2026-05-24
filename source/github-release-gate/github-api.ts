import { isDefined } from 'remeda';
import { Octokit } from '@octokit/core';
import { paginateRest } from '@octokit/plugin-paginate-rest';
import { restEndpointMethods } from '@octokit/plugin-rest-endpoint-methods';
import { z } from 'zod/mini';
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
    readonly event: string;
};

const GitHubRestClient = Octokit.plugin(restEndpointMethods, paginateRest);

export type GitHubReleaseGateApi = {
    readonly getLatestSuccessfulMainCiRun: (
        ciWorkflowFile: string,
        headSha: string
    ) => Promise<SuccessfulMainCiRun | undefined>;
    readonly getMainBranchHeadSha: () => Promise<string>;
    readonly getOpenPullRequestActivities: () => Promise<readonly PullRequestActivity[]>;
};

const workflowRunSchema = z.object({
    conclusion: z.union([z.null(), z.string()]),
    event: z.string(),
    head_sha: z.string(),
    html_url: z.string(),
    updated_at: z.string()
});
const workflowRunsResponseSchema = z.object({
    workflow_runs: z.array(workflowRunSchema)
});
const branchResponseSchema = z.object({
    commit: z.object({
        sha: z.string()
    })
});
const pullRequestSchema = z.object({
    created_at: z.string(),
    html_url: z.string(),
    number: z.number()
});
const timelineEventSchema = z.object({
    created_at: z.optional(z.union([z.null(), z.string()])),
    committer: z.optional(z.object({ date: z.string() })),
    event: z.string()
});

function parseTimestamp(timestamp: string): Date {
    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
        throw new TypeError(`Invalid timestamp: ${timestamp}`);
    }

    return date;
}

function selectTimelineEventTimestamp(event: RawTimelineEvent): string | undefined {
    if (event.event === 'committed') {
        return event.committer?.date;
    }
    return event.created_at ?? undefined;
}

function toPullRequestTimelineEvent(event: RawTimelineEvent): PullRequestTimelineEvent | undefined {
    const timestamp = selectTimelineEventTimestamp(event);
    if (timestamp === undefined) {
        return undefined;
    }
    return { createdAt: parseTimestamp(timestamp), event: event.event };
}

function createGitHubHeaders(token: string): Readonly<Record<string, string>> {
    return {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'user-agent': 'packtory-github-release-gate',
        'x-github-api-version': '2022-11-28'
    };
}

type RepositoryRequestContext = {
    readonly headers: Readonly<Record<string, string>>;
    readonly owner: string;
    readonly repo: string;
};

function createRepositoryRequestContext(context: GitHubRepositoryContext): RepositoryRequestContext {
    return {
        headers: createGitHubHeaders(context.token),
        owner: context.owner,
        repo: context.repo
    };
}

type GitHubDataResponse = Promise<{
    readonly data: unknown;
}>;

type GitHubPageResponses = AsyncIterable<{
    readonly data: unknown;
}>;

function createGitHubRestClient(
    fetchImplementation: typeof globalThis.fetch,
    requestContext: RepositoryRequestContext,
    context: GitHubRepositoryContext
): InstanceType<typeof GitHubRestClient> {
    return new GitHubRestClient({
        baseUrl: context.apiBaseUrl,
        request: {
            fetch: fetchImplementation,
            headers: requestContext.headers
        }
    });
}

function formatFailedRequestPath(requestUrl: string): string {
    const parsedUrl = new URL(requestUrl);
    return `${parsedUrl.pathname}${parsedUrl.search}`;
}

function rethrowGitHubRequestFailure(error: unknown): never {
    const requestUrl = String(Reflect.get(new Object(Reflect.get(new Object(error), 'request')), 'url'));
    const status = String(Reflect.get(new Object(error), 'status'));
    throw new Error(`GitHub API request failed (${status}) for ${formatFailedRequestPath(requestUrl)}`);
}

async function requestGitHubData<T>(requestData: GitHubDataResponse, parseResponse: (value: unknown) => T): Promise<T> {
    const data = await requestData
        .then((response) => {
            return response.data;
        })
        .catch(rethrowGitHubRequestFailure);

    return parseResponse(data);
}

async function paginateGitHubData<T>(
    requestPages: GitHubPageResponses,
    parsePage: (value: unknown) => readonly T[]
): Promise<readonly T[]> {
    const rawPages: unknown[] = [];

    try {
        for await (const response of requestPages) {
            rawPages.push(response.data);
        }
    } catch (error) {
        rethrowGitHubRequestFailure(error);
    }

    const pages: T[] = [];
    for (const rawPage of rawPages) {
        pages.push(...parsePage(rawPage));
    }
    return pages;
}

async function getPullRequestActivity(
    octokit: InstanceType<typeof GitHubRestClient>,
    requestContext: RepositoryRequestContext,
    pullRequest: PullRequest
): Promise<PullRequestActivity> {
    const timeline = await paginateGitHubData<RawTimelineEvent>(
        octokit.paginate.iterator(octokit.rest.issues.listEventsForTimeline, {
            ...requestContext,
            issue_number: pullRequest.number,
            per_page: 100
        }),
        (value) => {
            return z.array(timelineEventSchema).parse(value);
        }
    );
    const timelineEvents = timeline.map(toPullRequestTimelineEvent).filter(isDefined);

    return {
        number: pullRequest.number,
        htmlUrl: pullRequest.html_url,
        activityAt: selectPullRequestActivityAt(parseTimestamp(pullRequest.created_at), timelineEvents)
    };
}

export function createGitHubReleaseGateApi(
    fetchImplementation: typeof globalThis.fetch,
    context: GitHubRepositoryContext
): GitHubReleaseGateApi {
    const requestContext = createRepositoryRequestContext(context);
    const octokit = createGitHubRestClient(fetchImplementation, requestContext, context);

    return {
        async getMainBranchHeadSha() {
            const branch = await requestGitHubData<BranchResponse>(
                octokit.rest.repos.getBranch({
                    ...requestContext,
                    branch: context.defaultBranch
                }),
                (value) => {
                    return branchResponseSchema.parse(value);
                }
            );

            return branch.commit.sha;
        },

        async getLatestSuccessfulMainCiRun(ciWorkflowFile, headSha) {
            const response = await requestGitHubData<WorkflowRunsResponse>(
                octokit.rest.actions.listWorkflowRuns({
                    ...requestContext,
                    workflow_id: ciWorkflowFile,
                    branch: context.defaultBranch,
                    event: 'push',
                    head_sha: headSha,
                    status: 'completed',
                    per_page: 100
                }),
                (value) => {
                    return workflowRunsResponseSchema.parse(value);
                }
            );
            const matchingRun = response.workflow_runs.find((run) => {
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
            const openPullRequests = await paginateGitHubData<PullRequest>(
                octokit.paginate.iterator(octokit.rest.pulls.list, {
                    ...requestContext,
                    state: 'open',
                    base: context.defaultBranch,
                    per_page: 100
                }),
                (value) => {
                    return z.array(pullRequestSchema).parse(value);
                }
            );

            return Promise.all(
                openPullRequests.map(async (pullRequest) => {
                    return getPullRequestActivity(octokit, requestContext, pullRequest);
                })
            );
        }
    };
}
