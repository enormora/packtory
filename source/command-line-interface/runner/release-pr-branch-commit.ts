import { resolveGitHubResponse, resolveOptionalGitHubResponse } from './github-api-request.ts';

type CreateCommitFileAddition = {
    readonly contents: string;
    readonly path: string;
};
export type CreateCommitOnBranchInput = {
    readonly additions: readonly CreateCommitFileAddition[];
    readonly branch: string;
    readonly expectedHeadOid: string;
    readonly message: string;
};
export type ReleasePullRequestCommitClient = {
    readonly createCommitOnBranch: (input: CreateCommitOnBranchInput) => Promise<string>;
};
type GitRefInput = {
    readonly headers: Readonly<Record<string, string>>;
    readonly owner: string;
    readonly repo: string;
    readonly ref: string;
};
type CreateRefInput = GitRefInput & {
    readonly sha: string;
};
type UpdateRefInput = CreateRefInput & {
    readonly force: boolean;
};
type GitHubGitApi = {
    readonly createRef: (input: CreateRefInput) => Promise<unknown>;
    readonly getRef: (input: GitRefInput) => Promise<{ readonly data: RawGitRef }>;
    readonly updateRef: (input: UpdateRefInput) => Promise<unknown>;
};
type GitHubGraphQLApi = (
    query: string,
    variables: Readonly<Record<string, unknown>>
) => Promise<CreateCommitOnBranchResponse>;
export type ReleasePullRequestCommitClientDependencies = {
    readonly git: GitHubGitApi;
    readonly graphql: GitHubGraphQLApi;
    readonly headers: Readonly<Record<string, string>>;
    readonly owner: string;
    readonly repo: string;
    readonly repositoryNameWithOwner: string;
};
type RawGitRef = {
    readonly object: { readonly sha: string };
};
type CreateCommitOnBranchResponse = {
    readonly createCommitOnBranch: {
        readonly commit: { readonly oid: string };
    };
};

const missingGitHubResourceStatusCode = 404;

function createCommitOnBranchMutation(): string {
    return `
mutation CreateCommitOnBranch(
  $repositoryNameWithOwner: String!
  $branchName: String!
  $expectedHeadOid: GitObjectID!
  $headline: String!
  $additions: [FileAddition!]!
) {
  createCommitOnBranch(input: {
    branch: { repositoryNameWithOwner: $repositoryNameWithOwner, branchName: $branchName }
    message: { headline: $headline }
    expectedHeadOid: $expectedHeadOid
    fileChanges: { additions: $additions }
  }) {
    commit {
      oid
    }
  }
}
`;
}

export function createReleasePullRequestCommitClient(
    dependencies: ReleasePullRequestCommitClientDependencies
): ReleasePullRequestCommitClient {
    async function readBranchRef(branch: string): Promise<RawGitRef | undefined> {
        const response = await resolveOptionalGitHubResponse(
            dependencies.git.getRef({
                headers: dependencies.headers,
                owner: dependencies.owner,
                repo: dependencies.repo,
                ref: `heads/${branch}`
            }),
            missingGitHubResourceStatusCode
        );
        return response?.data;
    }

    async function pointBranchAtHead(branch: string, expectedHeadOid: string): Promise<void> {
        const branchRef = await readBranchRef(branch);
        if (branchRef === undefined) {
            await resolveGitHubResponse(
                dependencies.git.createRef({
                    headers: dependencies.headers,
                    owner: dependencies.owner,
                    ref: `refs/heads/${branch}`,
                    repo: dependencies.repo,
                    sha: expectedHeadOid
                })
            );
            return;
        }
        if (branchRef.object.sha === expectedHeadOid) {
            return;
        }
        await resolveGitHubResponse(
            dependencies.git.updateRef({
                force: true,
                headers: dependencies.headers,
                owner: dependencies.owner,
                ref: `heads/${branch}`,
                repo: dependencies.repo,
                sha: expectedHeadOid
            })
        );
    }

    return {
        async createCommitOnBranch(input) {
            await pointBranchAtHead(input.branch, input.expectedHeadOid);
            const response = await resolveGitHubResponse(
                dependencies.graphql(createCommitOnBranchMutation(), {
                    additions: input.additions,
                    branchName: input.branch,
                    expectedHeadOid: input.expectedHeadOid,
                    headline: input.message,
                    repositoryNameWithOwner: dependencies.repositoryNameWithOwner
                })
            );
            return response.createCommitOnBranch.commit.oid;
        }
    };
}
