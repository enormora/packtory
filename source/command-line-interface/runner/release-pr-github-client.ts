import { isDefined } from 'remeda';
import { Octokit } from '@octokit/core';
import { paginateRest } from '@octokit/plugin-paginate-rest';
import { restEndpointMethods } from '@octokit/plugin-rest-endpoint-methods';
import { createGitHubJsonRequestHeaders } from './github-api-request.ts';

export type PullRequestDetails = {
    readonly author: string;
    readonly baseRef: string;
    readonly changedFiles: readonly string[];
    readonly headRef: string;
    readonly headRepository: string;
    readonly labels: readonly string[];
    readonly mergeCommitSha: string | undefined;
    readonly merged: boolean;
    readonly number: number;
    readonly subject: string;
    readonly title: string;
};

type PullRequestHeadDetails = {
    readonly author: string;
    readonly changedFiles: readonly string[];
    readonly headRef: string;
    readonly labels: readonly string[];
    readonly parentShas: readonly string[];
    readonly subject: string;
    readonly title: string;
};

type WorkflowJobResult = {
    readonly conclusion: string | undefined;
    readonly name: string;
    readonly url: string | undefined;
};

type WorkflowRunResult = {
    readonly conclusion: string | undefined;
    readonly databaseId: number;
    readonly jobs: readonly WorkflowJobResult[];
};

export type ReleasePullRequestGitHubClient = {
    readonly closeOpenReleasePullRequests: (input: {
        readonly baseBranch: string;
        readonly releaseBranch: string;
    }) => Promise<void>;
    readonly createOrUpdateReleasePullRequest: (input: {
        readonly baseBranch: string;
        readonly body: string;
        readonly label: string;
        readonly releaseBranch: string;
        readonly title: string;
    }) => Promise<number>;
    readonly createStatus: (input: {
        readonly commitSha: string;
        readonly context: string;
        readonly description: string;
        readonly state: 'error' | 'failure' | 'pending' | 'success';
        readonly targetUrl: string | undefined;
    }) => Promise<void>;
    readonly deleteActionRequiredPullRequestRuns: (input: {
        readonly branch: string;
        readonly headSha: string;
    }) => Promise<void>;
    readonly dispatchWorkflow: (input: { readonly ref: string; readonly workflowFile: string }) => Promise<void>;
    readonly findDispatchedWorkflowRunId: (input: {
        readonly branch: string;
        readonly headSha: string;
        readonly workflowFile: string;
    }) => Promise<number | undefined>;
    readonly getBranchHeadSha: (branch: string) => Promise<string>;
    readonly getPullRequest: (pullRequestNumber: number) => Promise<PullRequestDetails>;
    readonly getPullRequestHead: (pullRequestNumber: number) => Promise<PullRequestHeadDetails>;
    readonly listCommitPullRequests: (commitSha: string) => Promise<readonly PullRequestDetails[]>;
    readonly readWorkflowRunResult: (runId: number) => Promise<WorkflowRunResult>;
};

type GitHubClientContext = {
    readonly fetch: typeof globalThis.fetch;
    readonly owner: string;
    readonly repo: string;
    readonly token: string;
};

type RawLabel = { readonly name?: string | null | undefined };
type RawPullRequest = {
    readonly base: { readonly ref: string };
    readonly head: {
        readonly ref: string;
        readonly repo: { readonly full_name: string | null } | null;
        readonly sha: string;
    };
    readonly labels: readonly RawLabel[];
    readonly merge_commit_sha: string | null;
    readonly merged_at?: string | null | undefined;
    readonly number: number;
    readonly title: string;
    readonly user: { readonly login: string } | null;
};
type RawCommit = {
    readonly commit: { readonly message: string };
    readonly parents: readonly { readonly sha: string }[];
};
type RawWorkflowRun = {
    readonly conclusion: string | null;
    readonly databaseId?: number | undefined;
    readonly database_id?: number | undefined;
    readonly event: string;
    readonly head_sha: string;
    readonly name?: string | null | undefined;
    readonly path?: string | null | undefined;
    readonly status: string | null;
    readonly workflow_id?: number | null | undefined;
};
type RawWorkflowJob = {
    readonly conclusion: string | null;
    readonly html_url?: string | null | undefined;
    readonly name: string;
};
type RawWorkflow = { readonly id: number; readonly name: string; readonly path: string };

type RequestContext = {
    readonly headers: Readonly<Record<string, string>>;
    readonly owner: string;
    readonly repo: string;
};

function labelNames(labels: readonly RawLabel[]): readonly string[] {
    return labels
        .map((label) => {
            return label.name ?? undefined;
        })
        .filter(isDefined);
}

function commitSubject(commit: RawCommit): string {
    const firstLineBreak = commit.commit.message.indexOf('\n');
    if (firstLineBreak === -1) {
        return commit.commit.message;
    }
    return commit.commit.message.slice(0, firstLineBreak);
}

function runDatabaseId(run: RawWorkflowRun): number | undefined {
    return run.database_id ?? run.databaseId;
}

function workflowMatchesIdentifier(workflow: RawWorkflow, identifier: string): boolean {
    return (
        String(workflow.id) === identifier ||
        workflow.name === identifier ||
        workflow.path === identifier ||
        workflow.path.endsWith(`/${identifier}`)
    );
}

function workflowRunPathMatches(run: RawWorkflowRun, workflow: RawWorkflow): boolean {
    return (
        run.path === undefined ||
        run.path === null ||
        run.path === workflow.path ||
        run.path.endsWith(`/${workflow.path}`)
    );
}

function workflowRunIdentityComparisons(run: RawWorkflowRun, workflow: RawWorkflow): readonly boolean[] {
    return [
        run.workflow_id === undefined || run.workflow_id === null || run.workflow_id === workflow.id,
        workflowRunPathMatches(run, workflow),
        run.name === undefined || run.name === null || run.name === workflow.name
    ];
}

function workflowRunMatchesIdentity(run: RawWorkflowRun, workflow: RawWorkflow): boolean {
    return workflowRunIdentityComparisons(run, workflow).every(Boolean);
}

function workflowRunMatchesInput(run: RawWorkflowRun, workflow: RawWorkflow, headSha: string): boolean {
    return run.head_sha === headSha && run.event === 'workflow_dispatch' && workflowRunMatchesIdentity(run, workflow);
}

function selectRawWorkflow(identifier: string, matches: readonly RawWorkflow[]): RawWorkflow {
    const workflow = matches[0];
    if (workflow === undefined) {
        throw new Error(`GitHub Actions workflow "${identifier}" was not found`);
    }
    if (matches.length === 1) {
        return { id: workflow.id, name: workflow.name, path: workflow.path };
    }
    throw new Error(`GitHub Actions workflow "${identifier}" matched multiple workflows`);
}

function findWorkflowRunIdInRuns(
    runs: readonly RawWorkflowRun[],
    workflow: RawWorkflow,
    headSha: string
): number | undefined {
    const run = runs.find((workflowRun) => {
        return workflowRunMatchesInput(workflowRun, workflow, headSha);
    });
    return run === undefined ? undefined : runDatabaseId(run);
}

function pullRequestIsMerged(pullRequest: RawPullRequest): boolean {
    return pullRequest.merged_at !== undefined && pullRequest.merged_at !== null;
}

function readReflectedProperty(value: unknown, property: string): unknown {
    return Reflect.get(new Object(value), property) as unknown;
}

function createRequestError(error: unknown): Error {
    const status = String(readReflectedProperty(error, 'status'));
    const requestUrl = String(readReflectedProperty(readReflectedProperty(error, 'request'), 'url'));
    const parsedUrl = new URL(requestUrl);
    return new Error(`GitHub API request failed (${status}) for ${parsedUrl.pathname}${parsedUrl.search}`, {
        cause: error
    });
}

async function resolveGitHubResponse<T>(request: Promise<T>): Promise<T> {
    try {
        return await request;
    } catch (error) {
        throw createRequestError(error);
    }
}

export function createReleasePullRequestGitHubClient(context: GitHubClientContext): ReleasePullRequestGitHubClient {
    const GitHubRestClient = Octokit.plugin(restEndpointMethods, paginateRest);
    const requestContext: RequestContext = {
        headers: createGitHubJsonRequestHeaders(context.token, 'packtory-release-pr'),
        owner: context.owner,
        repo: context.repo
    };
    const octokit = new GitHubRestClient({
        request: {
            fetch: context.fetch,
            headers: requestContext.headers
        }
    });

    async function readPullRequestFiles(pullRequestNumber: number): Promise<readonly string[]> {
        const files = await resolveGitHubResponse(
            octokit.paginate(octokit.rest.pulls.listFiles, {
                ...requestContext,
                pull_number: pullRequestNumber,
                per_page: 100
            })
        );
        return files.map((file) => {
            return file.filename;
        });
    }

    async function readCommit(commitSha: string): Promise<RawCommit> {
        const response = await resolveGitHubResponse(
            octokit.rest.repos.getCommit({
                ...requestContext,
                ref: commitSha
            })
        );
        return response.data;
    }

    async function toPullRequestDetails(pullRequest: RawPullRequest): Promise<PullRequestDetails> {
        const commit = await readCommit(pullRequest.head.sha);
        return {
            author: pullRequest.user?.login ?? '',
            baseRef: pullRequest.base.ref,
            changedFiles: await readPullRequestFiles(pullRequest.number),
            headRef: pullRequest.head.ref,
            headRepository: pullRequest.head.repo?.full_name ?? '',
            labels: labelNames(pullRequest.labels),
            mergeCommitSha: pullRequest.merge_commit_sha ?? undefined,
            merged: pullRequestIsMerged(pullRequest),
            number: pullRequest.number,
            subject: commitSubject(commit),
            title: pullRequest.title
        };
    }

    async function createReleasePullRequest(input: {
        readonly baseBranch: string;
        readonly body: string;
        readonly releaseBranch: string;
        readonly title: string;
    }): Promise<number> {
        const response = await resolveGitHubResponse(
            octokit.rest.pulls.create({
                ...requestContext,
                base: input.baseBranch,
                body: input.body,
                head: input.releaseBranch,
                title: input.title
            })
        );
        return response.data.number;
    }

    async function updateReleasePullRequest(
        input: { readonly body: string; readonly title: string },
        pullRequestNumber: number
    ): Promise<number> {
        const response = await resolveGitHubResponse(
            octokit.rest.pulls.update({
                ...requestContext,
                body: input.body,
                pull_number: pullRequestNumber,
                title: input.title
            })
        );
        return response.data.number;
    }

    async function resolveRawWorkflow(identifier: string): Promise<RawWorkflow> {
        const response = await resolveGitHubResponse(
            octokit.rest.actions.listRepoWorkflows({
                ...requestContext,
                per_page: 100
            })
        );
        const workflows = response.data.workflows as readonly RawWorkflow[];
        const matches = workflows.filter((workflow) => {
            return workflowMatchesIdentifier(workflow, identifier);
        });
        return selectRawWorkflow(identifier, matches);
    }

    return {
        async closeOpenReleasePullRequests(input) {
            const pullRequests = await resolveGitHubResponse(
                octokit.rest.pulls.list({
                    ...requestContext,
                    base: input.baseBranch,
                    head: `${context.owner}:${input.releaseBranch}`,
                    state: 'open'
                })
            );
            for (const pullRequest of pullRequests.data) {
                await resolveGitHubResponse(
                    octokit.rest.pulls.update({
                        ...requestContext,
                        pull_number: pullRequest.number,
                        state: 'closed'
                    })
                );
            }
        },

        async createOrUpdateReleasePullRequest(input) {
            const existingPullRequests = await resolveGitHubResponse(
                octokit.rest.pulls.list({
                    ...requestContext,
                    base: input.baseBranch,
                    head: `${context.owner}:${input.releaseBranch}`,
                    state: 'open'
                })
            );
            const existingPullRequest = existingPullRequests.data[0];
            const pullRequestNumber =
                existingPullRequest === undefined
                    ? await createReleasePullRequest(input)
                    : await updateReleasePullRequest(input, existingPullRequest.number);

            await resolveGitHubResponse(
                octokit.rest.issues.setLabels({
                    ...requestContext,
                    issue_number: pullRequestNumber,
                    labels: [input.label]
                })
            );
            return pullRequestNumber;
        },

        async createStatus(input) {
            await resolveGitHubResponse(
                octokit.rest.repos.createCommitStatus({
                    ...requestContext,
                    context: input.context,
                    description: input.description,
                    sha: input.commitSha,
                    state: input.state,
                    target_url: input.targetUrl ?? null
                })
            );
        },

        async deleteActionRequiredPullRequestRuns(input) {
            const response = await resolveGitHubResponse(
                octokit.rest.actions.listWorkflowRunsForRepo({
                    ...requestContext,
                    branch: input.branch,
                    event: 'pull_request',
                    per_page: 100
                })
            );
            const blockedRuns = response.data.workflow_runs.filter((run) => {
                return run.head_sha === input.headSha && run.conclusion === 'action_required';
            });
            const blockedRunIds = blockedRuns
                .map((run) => {
                    return runDatabaseId(run as RawWorkflowRun);
                })
                .filter(isDefined);
            for (const databaseId of blockedRunIds) {
                await resolveGitHubResponse(
                    octokit.rest.actions.deleteWorkflowRun({ ...requestContext, run_id: databaseId })
                );
            }
        },

        async dispatchWorkflow(input) {
            const workflow = await resolveRawWorkflow(input.workflowFile);
            await resolveGitHubResponse(
                octokit.rest.actions.createWorkflowDispatch({
                    ...requestContext,
                    ref: input.ref,
                    workflow_id: workflow.id
                })
            );
        },

        async findDispatchedWorkflowRunId(input) {
            const workflow = await resolveRawWorkflow(input.workflowFile);
            const workflowResponse = await resolveGitHubResponse(
                octokit.rest.actions.listWorkflowRuns({
                    ...requestContext,
                    branch: input.branch,
                    event: 'workflow_dispatch',
                    workflow_id: workflow.id,
                    per_page: 100
                })
            );
            const workflowRunId = findWorkflowRunIdInRuns(
                workflowResponse.data.workflow_runs as readonly RawWorkflowRun[],
                workflow,
                input.headSha
            );
            if (workflowRunId !== undefined) {
                return workflowRunId;
            }

            const repoResponse = await resolveGitHubResponse(
                octokit.rest.actions.listWorkflowRunsForRepo({
                    ...requestContext,
                    branch: input.branch,
                    event: 'workflow_dispatch',
                    per_page: 100
                })
            );
            return findWorkflowRunIdInRuns(
                repoResponse.data.workflow_runs as readonly RawWorkflowRun[],
                workflow,
                input.headSha
            );
        },

        async getBranchHeadSha(branch) {
            const response = await resolveGitHubResponse(
                octokit.rest.repos.getBranch({
                    ...requestContext,
                    branch
                })
            );
            return response.data.commit.sha;
        },

        async getPullRequest(pullRequestNumber) {
            const response = await resolveGitHubResponse(
                octokit.rest.pulls.get({
                    ...requestContext,
                    pull_number: pullRequestNumber
                })
            );
            return toPullRequestDetails(response.data);
        },

        async getPullRequestHead(pullRequestNumber) {
            const response = await resolveGitHubResponse(
                octokit.rest.pulls.get({
                    ...requestContext,
                    pull_number: pullRequestNumber
                })
            );
            const pullRequest = response.data;
            const commit = await readCommit(pullRequest.head.sha);
            return {
                author: pullRequest.user.login,
                changedFiles: await readPullRequestFiles(pullRequest.number),
                headRef: pullRequest.head.ref,
                labels: labelNames(pullRequest.labels),
                parentShas: commit.parents.map((parent) => {
                    return parent.sha;
                }),
                subject: commitSubject(commit),
                title: pullRequest.title
            };
        },

        async listCommitPullRequests(commitSha) {
            const pullRequests = await resolveGitHubResponse(
                octokit.paginate(octokit.rest.repos.listPullRequestsAssociatedWithCommit, {
                    ...requestContext,
                    commit_sha: commitSha,
                    per_page: 100
                })
            );
            return Promise.all(pullRequests.map(toPullRequestDetails));
        },

        async readWorkflowRunResult(runId) {
            const [runResponse, jobResponse] = await Promise.all([
                resolveGitHubResponse(octokit.rest.actions.getWorkflowRun({ ...requestContext, run_id: runId })),
                resolveGitHubResponse(
                    octokit.rest.actions.listJobsForWorkflowRun({
                        ...requestContext,
                        run_id: runId,
                        per_page: 100
                    })
                )
            ]);
            return {
                conclusion: runResponse.data.conclusion ?? undefined,
                databaseId: runId,
                jobs: jobResponse.data.jobs.map((job: RawWorkflowJob) => {
                    return {
                        conclusion: job.conclusion ?? undefined,
                        name: job.name,
                        url: job.html_url ?? undefined
                    };
                })
            };
        }
    };
}
