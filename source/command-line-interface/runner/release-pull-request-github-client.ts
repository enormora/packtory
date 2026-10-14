import { toGitHubRequest } from '../../common/github-request.ts';
import {
    createGitHubJavaScriptObjectNotationRequestHeaders,
    isMissingGitHubReferenceError,
    resolveGitHubResponse,
    resolveGitHubResponseUnless
} from './github-application-programming-interface-request.ts';
import {
    createGitHubProvider,
    isMergedPullRequest,
    readCommitSubject,
    readLabelNames,
    type GitHubCommit,
    type GitHubPullRequest
} from './github-provider.ts';
import {
    createReleasePullRequestCommitClient,
    type CreateCommitOnBranchInput
} from './release-pull-request-branch-commit.ts';
import {
    cancelActiveDispatchedWorkflowRuns,
    deleteActionRequiredPullRequestRuns
} from './release-pull-request-workflow-run-cancellation.ts';
import {
    findWorkflowRunIdentifierInRuns,
    observedWorkflowRunIdentifiers,
    selectReleaseWorkflow,
    workflowMatchesIdentifier,
    type ReleaseWorkflow,
    type ReleaseWorkflowRun,
    type WorkflowRunLookupResult
} from './release-pull-request-workflow-runs.ts';

export type PullRequestDetails = {
    readonly author: string;
    readonly baseReference: string;
    readonly changedFiles: readonly string[];
    readonly headReference: string;
    readonly headRepository: string;
    readonly labels: readonly string[];
    readonly mergeCommitHash: string | undefined;
    readonly merged: boolean;
    readonly number: number;
    readonly subject: string;
    readonly title: string;
};

type PullRequestHeadDetails = {
    readonly author: string;
    readonly changedFiles: readonly string[];
    readonly headReference: string;
    readonly labels: readonly string[];
    readonly parentHashes: readonly string[];
    readonly subject: string;
    readonly title: string;
};

type WorkflowJobResult = {
    readonly conclusion: string | undefined;
    readonly name: string;
    readonly address: string | undefined;
};

type WorkflowRunResult = {
    readonly conclusion: string | undefined;
    readonly databaseIdentifier: number;
    readonly jobs: readonly WorkflowJobResult[];
    readonly address: string | undefined;
};
type CloseOpenReleasePullRequestsInput = {
    readonly baseBranch: string;
    readonly releaseBranch: string;
};
type CreateOrUpdateReleasePullRequestInput = {
    readonly baseBranch: string;
    readonly body: string;
    readonly label: string;
    readonly releaseBranch: string;
    readonly title: string;
};
type CreateReleasePullRequestInput = {
    readonly baseBranch: string;
    readonly body: string;
    readonly releaseBranch: string;
    readonly title: string;
};
type CreateStatusInput = {
    readonly commitHash: string;
    readonly context: string;
    readonly description: string;
    readonly state: 'error' | 'failure' | 'pending' | 'success';
    readonly targetAddress: string | undefined;
};
type CancelActiveDispatchedWorkflowRunsInput = {
    readonly branch: string;
    readonly workflowFile: string;
};
type DeleteActionRequiredPullRequestRunsInput = {
    readonly branch: string;
    readonly headHash: string;
};
type DispatchWorkflowInput = {
    readonly reference: string;
    readonly workflowFile: string;
};
type FindDispatchedWorkflowRunInput = {
    readonly branch: string;
    readonly headHash: string;
    readonly workflowFile: string;
};
type ReleasePullRequestUpdateInput = {
    readonly body: string;
    readonly title: string;
};
export type ReleasePullRequestGitHubClient = {
    readonly cancelActiveDispatchedWorkflowRuns: (
        input: CancelActiveDispatchedWorkflowRunsInput
    ) => Promise<readonly number[]>;
    readonly closeOpenReleasePullRequests: (input: CloseOpenReleasePullRequestsInput) => Promise<void>;
    readonly createCommitOnBranch: (input: CreateCommitOnBranchInput) => Promise<string>;
    readonly createOrUpdateReleasePullRequest: (input: CreateOrUpdateReleasePullRequestInput) => Promise<number>;
    readonly createStatus: (input: CreateStatusInput) => Promise<void>;
    readonly deleteActionRequiredPullRequestRuns: (
        input: DeleteActionRequiredPullRequestRunsInput
    ) => Promise<readonly number[]>;
    readonly deleteBranch: (branch: string) => Promise<void>;
    readonly dispatchWorkflow: (input: DispatchWorkflowInput) => Promise<void>;
    readonly findDispatchedWorkflowRun: (input: FindDispatchedWorkflowRunInput) => Promise<WorkflowRunLookupResult>;
    readonly getBranchHeadHash: (branch: string) => Promise<string>;
    readonly getPullRequest: (pullRequestNumber: number) => Promise<PullRequestDetails>;
    readonly getPullRequestHead: (pullRequestNumber: number) => Promise<PullRequestHeadDetails>;
    readonly listCommitPullRequests: (commitHash: string) => Promise<readonly PullRequestDetails[]>;
    readonly readWorkflowRunResult: (runIdentifier: number) => Promise<WorkflowRunResult>;
};

type GitHubClientContext = {
    readonly applicationProgrammingInterfaceBaseAddress: string;
    readonly fetch: typeof globalThis.fetch;
    readonly owner: string;
    readonly repository: string;
    readonly token: string | undefined;
};

type RawWorkflowRun = ReleaseWorkflowRun & {
    readonly conclusion: string | null;
    readonly html_url?: string | null | undefined;
    readonly status: string | null;
};
type RawWorkflowJob = {
    readonly conclusion: string | null;
    readonly html_url?: string | null | undefined;
    readonly name: string;
};

type RequestContext = {
    readonly headers: Readonly<Record<string, string>>;
    readonly owner: string;
    readonly repository: string;
};

export function createReleasePullRequestGitHubClient(context: GitHubClientContext): ReleasePullRequestGitHubClient {
    const requestContext: RequestContext = {
        headers: createGitHubJavaScriptObjectNotationRequestHeaders(context.token, 'packtory-release-pull-request'),
        owner: context.owner,
        repository: context.repository
    };
    const octokit = createGitHubProvider({
        baseAddress: context.applicationProgrammingInterfaceBaseAddress,
        fetch: context.fetch,
        headers: requestContext.headers
    });
    const commitClient = createReleasePullRequestCommitClient({
        git: {
            async createReference(input) {
                return octokit.rest.git.createRef(toGitHubRequest(input));
            },
            async deleteReference(input) {
                return octokit.rest.git.deleteRef(toGitHubRequest(input));
            },
            async getReference(input) {
                return octokit.rest.git.getRef(toGitHubRequest(input));
            },
            async updateReference(input) {
                return octokit.rest.git.updateRef(toGitHubRequest(input));
            }
        },
        async graphql(query, parameters) {
            return octokit.graphql(query, toGitHubRequest(parameters));
        },
        headers: requestContext.headers,
        owner: context.owner,
        repository: context.repository,
        repositoryNameWithOwner: `${context.owner}/${context.repository}`
    });

    async function readPullRequestFiles(pullRequestNumber: number): Promise<readonly string[]> {
        const files = await resolveGitHubResponse(
            octokit.paginate(
                octokit.rest.pulls.listFiles,
                toGitHubRequest({
                    ...requestContext,
                    pull_number: pullRequestNumber,
                    per_page: 100
                })
            )
        );
        return files.map(function (file) {
            return file.filename;
        });
    }

    async function readCommit(commitHash: string): Promise<GitHubCommit> {
        const response = await resolveGitHubResponse(
            octokit.rest.repos.getCommit(toGitHubRequest({
                ...requestContext,
                reference: commitHash
            }))
        );
        return response.data;
    }

    async function toPullRequestDetails(pullRequest: GitHubPullRequest): Promise<PullRequestDetails> {
        const commit = await readCommit(pullRequest.head.sha);
        return {
            author: pullRequest.user?.login ?? '',
            baseReference: pullRequest.base.ref,
            changedFiles: await readPullRequestFiles(pullRequest.number),
            headReference: pullRequest.head.ref,
            headRepository: pullRequest.head.repo?.full_name ?? '',
            labels: readLabelNames(pullRequest.labels),
            mergeCommitHash: pullRequest.merge_commit_sha ?? undefined,
            merged: isMergedPullRequest(pullRequest),
            number: pullRequest.number,
            subject: readCommitSubject(commit),
            title: pullRequest.title
        };
    }

    async function createReleasePullRequest(input: CreateReleasePullRequestInput): Promise<number> {
        const response = await resolveGitHubResponse(
            octokit.rest.pulls.create(toGitHubRequest({
                ...requestContext,
                base: input.baseBranch,
                body: input.body,
                head: input.releaseBranch,
                title: input.title
            }))
        );
        return response.data.number;
    }

    async function updateReleasePullRequest(
        input: ReleasePullRequestUpdateInput,
        pullRequestNumber: number
    ): Promise<number> {
        const response = await resolveGitHubResponse(
            octokit.rest.pulls.update(toGitHubRequest({
                ...requestContext,
                body: input.body,
                pull_number: pullRequestNumber,
                title: input.title
            }))
        );
        return response.data.number;
    }

    async function resolveRawWorkflow(identifier: string): Promise<ReleaseWorkflow> {
        const response = await resolveGitHubResponse(
            octokit.rest.actions.listRepoWorkflows(toGitHubRequest({
                ...requestContext,
                per_page: 100
            }))
        );
        const workflows = response.data.workflows.map(function (workflow): ReleaseWorkflow {
            return { identifier: workflow.id, name: workflow.name, path: workflow.path };
        });
        const matches = workflows.filter(function (workflow) {
            return workflowMatchesIdentifier(workflow, identifier);
        });
        return selectReleaseWorkflow(identifier, matches);
    }

    return {
        async cancelActiveDispatchedWorkflowRuns(input) {
            const workflow = await resolveRawWorkflow(input.workflowFile);
            return cancelActiveDispatchedWorkflowRuns({
                branch: input.branch,
                async cancelWorkflowRun(request) {
                    return octokit.rest.actions.cancelWorkflowRun(toGitHubRequest(request));
                },
                async listWorkflowRuns(request) {
                    return octokit.rest.actions.listWorkflowRuns(toGitHubRequest(request));
                },
                requestContext,
                workflow
            });
        },

        async closeOpenReleasePullRequests(input) {
            const pullRequests = await resolveGitHubResponse(
                octokit.rest.pulls.list(toGitHubRequest({
                    ...requestContext,
                    base: input.baseBranch,
                    head: `${context.owner}:${input.releaseBranch}`,
                    state: 'open'
                }))
            );
            for (const pullRequest of pullRequests.data) {
                await resolveGitHubResponse(
                    octokit.rest.pulls.update(toGitHubRequest({
                        ...requestContext,
                        pull_number: pullRequest.number,
                        state: 'closed'
                    }))
                );
            }
        },

        async createCommitOnBranch(input) {
            return commitClient.createCommitOnBranch(input);
        },

        async createOrUpdateReleasePullRequest(input) {
            const existingPullRequests = await resolveGitHubResponse(
                octokit.rest.pulls.list(toGitHubRequest({
                    ...requestContext,
                    base: input.baseBranch,
                    head: `${context.owner}:${input.releaseBranch}`,
                    state: 'open'
                }))
            );
            const existingPullRequest = existingPullRequests.data[0];
            const pullRequestNumber = existingPullRequest === undefined
                ? await createReleasePullRequest(input)
                : await updateReleasePullRequest(input, existingPullRequest.number);

            await resolveGitHubResponse(
                octokit.rest.issues.setLabels(toGitHubRequest({
                    ...requestContext,
                    issue_number: pullRequestNumber,
                    labels: [ input.label ]
                }))
            );
            return pullRequestNumber;
        },

        async createStatus(input) {
            await resolveGitHubResponse(
                octokit.rest.repos.createCommitStatus(toGitHubRequest({
                    ...requestContext,
                    context: input.context,
                    description: input.description,
                    hash: input.commitHash,
                    state: input.state,
                    target_url: input.targetAddress ?? null
                }))
            );
        },

        async deleteActionRequiredPullRequestRuns(input) {
            return deleteActionRequiredPullRequestRuns({
                branch: input.branch,
                async deleteWorkflowRun(request) {
                    return octokit.rest.actions.deleteWorkflowRun(toGitHubRequest(request));
                },
                headHash: input.headHash,
                async listWorkflowRunsForRepository(request) {
                    return octokit.rest.actions.listWorkflowRunsForRepo(toGitHubRequest(request));
                },
                requestContext
            });
        },

        async deleteBranch(branch) {
            await resolveGitHubResponseUnless(
                octokit.rest.git.deleteRef(toGitHubRequest({
                    ...requestContext,
                    reference: `heads/${branch}`
                })),
                isMissingGitHubReferenceError
            );
        },

        async dispatchWorkflow(input) {
            const workflow = await resolveRawWorkflow(input.workflowFile);
            await resolveGitHubResponse(
                octokit.rest.actions.createWorkflowDispatch(toGitHubRequest({
                    ...requestContext,
                    reference: input.reference,
                    workflow_id: workflow.identifier
                }))
            );
        },

        async findDispatchedWorkflowRun(input) {
            const workflow = await resolveRawWorkflow(input.workflowFile);
            const workflowResponse = await resolveGitHubResponse(
                octokit.rest.actions.listWorkflowRuns(toGitHubRequest({
                    ...requestContext,
                    branch: input.branch,
                    event: 'workflow_dispatch',
                    workflow_id: workflow.identifier,
                    per_page: 100
                }))
            );
            const workflowRuns = workflowResponse.data.workflow_runs as readonly RawWorkflowRun[];
            const workflowRunIdentifier = findWorkflowRunIdentifierInRuns(workflowRuns, workflow, input.headHash);
            if (workflowRunIdentifier !== undefined) {
                return {
                    event: 'workflow_dispatch',
                    observedRunIdentifiers: observedWorkflowRunIdentifiers(workflowRuns),
                    runIdentifier: workflowRunIdentifier
                };
            }

            const repositoryResponse = await resolveGitHubResponse(
                octokit.rest.actions.listWorkflowRunsForRepo(toGitHubRequest({
                    ...requestContext,
                    branch: input.branch,
                    event: 'workflow_dispatch',
                    per_page: 100
                }))
            );
            const repositoryRuns = repositoryResponse.data.workflow_runs as readonly RawWorkflowRun[];
            return {
                event: 'workflow_dispatch',
                observedRunIdentifiers: [
                    ...observedWorkflowRunIdentifiers(workflowRuns),
                    ...observedWorkflowRunIdentifiers(repositoryRuns)
                ],
                runIdentifier: findWorkflowRunIdentifierInRuns(repositoryRuns, workflow, input.headHash)
            };
        },

        async getBranchHeadHash(branch) {
            const response = await resolveGitHubResponse(
                octokit.rest.repos.getBranch(toGitHubRequest({
                    ...requestContext,
                    branch
                }))
            );
            return response.data.commit.sha;
        },

        async getPullRequest(pullRequestNumber) {
            const response = await resolveGitHubResponse(
                octokit.rest.pulls.get(toGitHubRequest({
                    ...requestContext,
                    pull_number: pullRequestNumber
                }))
            );
            return toPullRequestDetails(response.data);
        },

        async getPullRequestHead(pullRequestNumber) {
            const response = await resolveGitHubResponse(
                octokit.rest.pulls.get(toGitHubRequest({
                    ...requestContext,
                    pull_number: pullRequestNumber
                }))
            );
            const pullRequest = response.data;
            const commit = await readCommit(pullRequest.head.sha);
            return {
                author: pullRequest.user.login,
                changedFiles: await readPullRequestFiles(pullRequest.number),
                headReference: pullRequest.head.ref,
                labels: readLabelNames(pullRequest.labels),
                parentHashes: commit.parents.map(function (parent) {
                    return parent.sha;
                }),
                subject: readCommitSubject(commit),
                title: pullRequest.title
            };
        },

        async listCommitPullRequests(commitHash) {
            const pullRequests = await resolveGitHubResponse(
                octokit.paginate(
                    octokit.rest.repos.listPullRequestsAssociatedWithCommit,
                    toGitHubRequest({
                        ...requestContext,
                        commit_sha: commitHash,
                        per_page: 100
                    })
                )
            );
            return Promise.all(pullRequests.map(toPullRequestDetails));
        },

        async readWorkflowRunResult(runIdentifier) {
            const [ runResponse, jobResponse ] = await Promise.all([
                resolveGitHubResponse(
                    octokit.rest.actions.getWorkflowRun(toGitHubRequest({ ...requestContext, run_id: runIdentifier }))
                ),
                resolveGitHubResponse(
                    octokit.rest.actions.listJobsForWorkflowRun(toGitHubRequest({
                        ...requestContext,
                        run_id: runIdentifier,
                        per_page: 100
                    }))
                )
            ]);
            return {
                conclusion: runResponse.data.conclusion ?? undefined,
                databaseIdentifier: runIdentifier,
                jobs: jobResponse.data.jobs.map(function (job: RawWorkflowJob) {
                    return {
                        conclusion: job.conclusion ?? undefined,
                        name: job.name,
                        address: job.html_url ?? undefined
                    };
                }),
                address: runResponse.data.html_url
            };
        }
    };
}
