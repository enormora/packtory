import { createHash } from 'node:crypto';
import {
    isMissingGitHubReferenceError,
    resolveGitHubResponse,
    resolveGitHubResponseUnless,
    resolveOptionalGitHubResponse
} from './github-application-programming-interface-request.ts';

type CreateCommitFileAddition = {
    readonly contents: string;
    readonly path: string;
};
export type CreateCommitOnBranchInput = {
    readonly additions: readonly CreateCommitFileAddition[];
    readonly branch: string;
    readonly expectedHeadObjectIdentifier: string;
    readonly message: string;
};
export type ReleasePullRequestCommitClient = {
    readonly createCommitOnBranch: (input: CreateCommitOnBranchInput) => Promise<string>;
};
type GitReferenceInput = {
    readonly headers: Readonly<Record<string, string>>;
    readonly owner: string;
    readonly repository: string;
    readonly reference: string;
};
type CreateReferenceInput = GitReferenceInput & {
    readonly hash: string;
};
type UpdateReferenceInput = CreateReferenceInput & {
    readonly force: boolean;
};
type GitHubGitApplicationProgrammingInterface = {
    readonly createReference: (input: CreateReferenceInput) => Promise<unknown>;
    readonly deleteReference: (input: GitReferenceInput) => Promise<unknown>;
    readonly getReference: (input: GitReferenceInput) => Promise<{ readonly data: RawGitReference; }>;
    readonly updateReference: (input: UpdateReferenceInput) => Promise<unknown>;
};
type GitHubGraphQLApplicationProgrammingInterface = (
    query: string,
    parameters: Readonly<Record<string, unknown>>
) => Promise<CreateCommitOnBranchResponse>;
export type ReleasePullRequestCommitClientDependencies = {
    readonly git: GitHubGitApplicationProgrammingInterface;
    readonly graphql: GitHubGraphQLApplicationProgrammingInterface;
    readonly headers: Readonly<Record<string, string>>;
    readonly owner: string;
    readonly repository: string;
    readonly repositoryNameWithOwner: string;
};
type RawGitReference = {
    readonly object: { readonly sha: string; };
};
type CreateCommitOnBranchResponse = {
    readonly createCommitOnBranch: {
        readonly commit: { readonly oid: string; };
    };
};

const missingGitHubResourceStatusCode = 404;
const sanitizedBranchNameLength = 80;
const temporaryBranchHeadLength = 12;
const temporaryBranchNamespace = 'packtory-release-pull-request-staging';

function sanitizeBranchName(branch: string): string {
    const readableName = (branch.match(/[A-Za-z0-9]+/gu) ?? [])
        .join('-')
        .slice(0, sanitizedBranchNameLength);
    const branchHash = createHash('sha256').update(branch).digest('hex').slice(0, temporaryBranchHeadLength);
    return `${readableName.length === 0 ? 'branch' : readableName}-${branchHash}`;
}

function temporaryBranchName(branch: string, expectedHeadObjectIdentifier: string): string {
    return [
        temporaryBranchNamespace,
        sanitizeBranchName(branch),
        expectedHeadObjectIdentifier.slice(0, temporaryBranchHeadLength)
    ]
        .join('-');
}

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
    async function readBranchReference(branch: string): Promise<RawGitReference | undefined> {
        const response = await resolveOptionalGitHubResponse(
            dependencies.git.getReference({
                headers: dependencies.headers,
                owner: dependencies.owner,
                repository: dependencies.repository,
                reference: `heads/${branch}`
            }),
            missingGitHubResourceStatusCode
        );
        return response?.data;
    }

    async function pointBranchAtHead(branch: string, targetHeadObjectIdentifier: string): Promise<void> {
        const branchReference = await readBranchReference(branch);
        if (branchReference === undefined) {
            await resolveGitHubResponse(
                dependencies.git.createReference({
                    headers: dependencies.headers,
                    owner: dependencies.owner,
                    reference: `refs/heads/${branch}`,
                    repository: dependencies.repository,
                    hash: targetHeadObjectIdentifier
                })
            );
            return;
        }
        if (branchReference.object.sha === targetHeadObjectIdentifier) {
            return;
        }
        await resolveGitHubResponse(
            dependencies.git.updateReference({
                force: true,
                headers: dependencies.headers,
                owner: dependencies.owner,
                reference: `heads/${branch}`,
                repository: dependencies.repository,
                hash: targetHeadObjectIdentifier
            })
        );
    }

    async function deleteBranchReference(branch: string): Promise<void> {
        await resolveGitHubResponseUnless(
            dependencies.git.deleteReference({
                headers: dependencies.headers,
                owner: dependencies.owner,
                repository: dependencies.repository,
                reference: `heads/${branch}`
            }),
            isMissingGitHubReferenceError
        );
    }

    return {
        async createCommitOnBranch(input) {
            const temporaryBranch = temporaryBranchName(input.branch, input.expectedHeadObjectIdentifier);
            await pointBranchAtHead(temporaryBranch, input.expectedHeadObjectIdentifier);
            try {
                const response = await resolveGitHubResponse(
                    dependencies.graphql(createCommitOnBranchMutation(), {
                        additions: input.additions,
                        branchName: temporaryBranch,
                        expectedHeadObjectIdentifier: input.expectedHeadObjectIdentifier,
                        headers: dependencies.headers,
                        headline: input.message,
                        repositoryNameWithOwner: dependencies.repositoryNameWithOwner
                    })
                );
                const releaseHead = response.createCommitOnBranch.commit.oid;
                await pointBranchAtHead(input.branch, releaseHead);
                return releaseHead;
            } finally {
                await deleteBranchReference(temporaryBranch);
            }
        }
    };
}
