import { isDefined } from 'remeda';
import { Octokit } from '@octokit/core';
import { paginateRest } from '@octokit/plugin-paginate-rest';
import { restEndpointMethods } from '@octokit/plugin-rest-endpoint-methods';
import { toGitHubRequest } from '../common/github-request.ts';
import {
    selectPullRequestActivityAt,
    type MainContinuousIntegrationRunStatus,
    type PullRequestActivity,
    type PullRequestTimelineEvent
} from './release-gate.ts';
import type { GitHubRepositoryContext } from './runner-configuration.ts';

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

export type GitHubReleaseGateApplicationProgrammingInterface = {
    readonly getMainBranchHeadHash: () => Promise<string>;
    readonly getMainContinuousIntegrationRunStatus: (
        continuousIntegrationWorkflowFile: string,
        headHash: string
    ) => Promise<MainContinuousIntegrationRunStatus>;
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
    const requestAddress = String(readReflectedProperty(readReflectedProperty(error, 'request'), 'url'));
    const status = String(readReflectedProperty(error, 'status'));
    const parsedAddress = new URL(requestAddress);
    return new Error(`GitHub API request failed (${status}) for ${parsedAddress.pathname}${parsedAddress.search}`, {
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
    readonly repository: string;
};

function createRequestHeaders(context: GitHubRepositoryContext): Readonly<Record<string, string>> {
    return {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${context.token}`,
        'user-agent': 'packtory-github-release-gate',
        'x-github-api-version': '2022-11-28'
    };
}

export function createGitHubReleaseGateApplicationProgrammingInterface(
    fetchImplementation: typeof globalThis.fetch,
    context: GitHubRepositoryContext
): GitHubReleaseGateApplicationProgrammingInterface {
    const GitHubWebClient = Octokit.plugin(restEndpointMethods, paginateRest);
    const requestContext: RepositoryRequestContext = {
        headers: createRequestHeaders(context),
        owner: context.owner,
        repository: context.repository
    };
    const octokit = new GitHubWebClient(toGitHubRequest({
        baseAddress: context.applicationProgrammingInterfaceBaseAddress,
        request: {
            fetch: fetchImplementation,
            headers: requestContext.headers
        }
    }));

    return {
        async getMainBranchHeadHash() {
            const branch = await resolveGitHubResponse<{ readonly data: BranchResponse; }>(
                octokit.rest.repos.getBranch(toGitHubRequest({
                    ...requestContext,
                    branch: context.defaultBranch
                }))
            );

            return branch.data.commit.sha;
        },

        async getMainContinuousIntegrationRunStatus(continuousIntegrationWorkflowFile, headHash) {
            const response = await resolveGitHubResponse<{ readonly data: WorkflowRunsResponse; }>(
                octokit.rest.actions.listWorkflowRuns(toGitHubRequest({
                    ...requestContext,
                    workflow_id: continuousIntegrationWorkflowFile,
                    branch: context.defaultBranch,
                    event: 'push',
                    head_sha: headHash,
                    per_page: 100
                }))
            );
            const matchingRuns = response.data.workflow_runs.filter(function (run) {
                return run.head_sha === headHash && run.event === 'push';
            });
            const successfulRun = matchingRuns.find(function (run) {
                return run.conclusion === 'success';
            });

            if (successfulRun !== undefined) {
                return {
                    kind: 'success',
                    run: {
                        hypertextMarkupLanguageAddress: successfulRun.html_url,
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
                octokit.paginate(
                    octokit.rest.pulls.list,
                    toGitHubRequest({
                        ...requestContext,
                        state: 'open',
                        base: context.defaultBranch,
                        per_page: 100
                    })
                )
            );

            return Promise.all(
                openPullRequests.map(async function (pullRequest) {
                    const timeline = await resolveGitHubResponse<readonly RawTimelineEvent[]>(
                        octokit.paginate(
                            octokit.rest.issues.listEventsForTimeline,
                            toGitHubRequest({
                                ...requestContext,
                                issue_number: pullRequest.number,
                                per_page: 100
                            })
                        )
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
                        hypertextMarkupLanguageAddress: pullRequest.html_url,
                        activityAt: selectPullRequestActivityAt(parseTimestamp(pullRequest.created_at), timelineEvents)
                    };
                })
            );
        }
    };
}
