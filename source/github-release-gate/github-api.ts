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
    readonly created_at: string;
    readonly event: string;
};

type HttpContext = Pick<GitHubRepositoryContext, 'apiBaseUrl' | 'token'>;

export type GitHubReleaseGateApi = {
    readonly getLatestSuccessfulMainCiRun: (
        ciWorkflowFile: string,
        headSha: string
    ) => Promise<SuccessfulMainCiRun | undefined>;
    readonly getMainBranchHeadSha: () => Promise<string>;
    readonly getOpenPullRequestActivities: () => Promise<readonly PullRequestActivity[]>;
};

const apiVersion = '2022-11-28';
const githubReleaseGateUserAgent = 'packtory-github-release-gate';

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
    created_at: z.string(),
    event: z.string()
});

function parseTimestamp(timestamp: string): Date {
    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
        throw new TypeError(`Invalid timestamp: ${timestamp}`);
    }

    return date;
}

function getHeaders(token: string): Readonly<Record<string, string>> {
    return {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': githubReleaseGateUserAgent,
        'X-GitHub-Api-Version': apiVersion
    };
}

async function fetchApi(
    fetchImplementation: typeof globalThis.fetch,
    context: HttpContext,
    path: string
): Promise<Response> {
    const response = await fetchImplementation(new URL(path, context.apiBaseUrl), {
        headers: getHeaders(context.token)
    });

    if (!response.ok) {
        throw new Error(`GitHub API request failed (${response.status} ${response.statusText}) for ${path}`);
    }

    return response;
}

async function fetchJson<T>(
    fetchImplementation: typeof globalThis.fetch,
    context: HttpContext,
    path: string,
    parse: (value: unknown) => T
): Promise<T> {
    const response = await fetchApi(fetchImplementation, context, path);
    return parse((await response.json()) as unknown);
}

function findNextLinkEntry(linkHeader: string): string | undefined {
    return linkHeader
        .split(',')
        .map((entry) => {
            return entry.trim();
        })
        .find((entry) => {
            return entry.endsWith('rel="next"');
        });
}

function getLinkHref(linkEntry: string): string {
    return String(linkEntry.split(';')[0]).slice(1, -1);
}

function getNextPagePath(linkHeader: string | null): string | undefined {
    if (linkHeader === null) {
        return undefined;
    }

    const nextEntry = findNextLinkEntry(linkHeader);

    if (nextEntry === undefined) {
        return undefined;
    }

    const nextHref = getLinkHref(nextEntry);

    if (nextHref.length === 0) {
        return undefined;
    }

    const nextUrl = new URL(nextHref);
    return `${nextUrl.pathname}${nextUrl.search}`;
}

async function fetchPaginated<T>(
    fetchImplementation: typeof globalThis.fetch,
    context: HttpContext,
    path: string,
    parsePage: (value: unknown) => readonly T[]
): Promise<readonly T[]> {
    async function collectPage(currentPath: string | undefined, values: T[]): Promise<readonly T[]> {
        if (currentPath === undefined) {
            return values;
        }

        const response = await fetchApi(fetchImplementation, context, currentPath);
        const pageValues = parsePage((await response.json()) as unknown);
        values.push(...pageValues);
        return collectPage(getNextPagePath(response.headers.get('link')), values);
    }

    return collectPage(path, []);
}

async function getPullRequestActivity(
    fetchImplementation: typeof globalThis.fetch,
    context: GitHubRepositoryContext,
    pullRequest: PullRequest
): Promise<PullRequestActivity> {
    const timeline = await fetchPaginated<RawTimelineEvent>(
        fetchImplementation,
        context,
        `/repos/${context.owner}/${context.repo}/issues/${pullRequest.number}/timeline?per_page=100`,
        (value) => {
            return z.array(timelineEventSchema).parse(value);
        }
    );
    const timelineEvents: PullRequestTimelineEvent[] = timeline.map((event) => {
        return {
            createdAt: parseTimestamp(event.created_at),
            event: event.event
        };
    });

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
    return {
        async getMainBranchHeadSha() {
            const branch = await fetchJson<BranchResponse>(
                fetchImplementation,
                context,
                `/repos/${context.owner}/${context.repo}/branches/${encodeURIComponent(context.defaultBranch)}`,
                (value) => {
                    return branchResponseSchema.parse(value);
                }
            );

            return branch.commit.sha;
        },

        async getLatestSuccessfulMainCiRun(ciWorkflowFile, headSha) {
            const response = await fetchJson<WorkflowRunsResponse>(
                fetchImplementation,
                context,
                `/repos/${context.owner}/${context.repo}/actions/workflows/${encodeURIComponent(
                    ciWorkflowFile
                )}/runs?branch=${encodeURIComponent(
                    context.defaultBranch
                )}&event=push&head_sha=${encodeURIComponent(headSha)}&status=completed&per_page=100`,
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
            const openPullRequests = await fetchPaginated<PullRequest>(
                fetchImplementation,
                context,
                `/repos/${context.owner}/${context.repo}/pulls?state=open&base=${encodeURIComponent(
                    context.defaultBranch
                )}&per_page=100`,
                (value) => {
                    return z.array(pullRequestSchema).parse(value);
                }
            );

            return Promise.all(
                openPullRequests.map(async (pullRequest) => {
                    return getPullRequestActivity(fetchImplementation, context, pullRequest);
                })
            );
        }
    };
}
