import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    createReleasePullRequestCommitClient,
    type CreateCommitOnBranchInput,
    type ReleasePullRequestCommitClientDependencies
} from './release-pr-branch-commit.ts';

type GitOperation = {
    readonly input: Readonly<Record<string, unknown>>;
    readonly name: string;
};
type GraphQLCall = {
    readonly query: string;
    readonly variables: Readonly<Record<string, unknown>>;
};
type CommitScenarioResult = {
    readonly graphQLCalls: readonly GraphQLCall[];
    readonly operations: readonly GitOperation[];
    readonly releaseHead: string;
};

const encodedChangelogContent = Buffer.from('updated changelog\n', 'utf8').toString('base64');
const missingGitHubResourceStatusCode = 404;
const releaseBranchRef = 'heads/release/packtory';

function createDependencies(
    currentBranchHead: string | undefined,
    recordOperation: (operation: GitOperation) => void,
    recordGraphQLCall: (call: GraphQLCall) => void
): ReleasePullRequestCommitClientDependencies {
    return {
        git: {
            async createRef(input) {
                recordOperation({ input, name: 'createRef' });
                return {};
            },
            async getRef(input) {
                recordOperation({ input, name: 'getRef' });
                if (currentBranchHead === undefined) {
                    const error = new Error('Not Found');
                    Object.assign(error, {
                        request: {
                            url: [
                                'https://api.github.com/repos/owner/repo/git/ref/',
                                encodeURIComponent(releaseBranchRef)
                            ].join('')
                        },
                        status: missingGitHubResourceStatusCode
                    });
                    throw error;
                }
                return { data: { object: { sha: currentBranchHead } } };
            },
            async updateRef(input) {
                recordOperation({ input, name: 'updateRef' });
                return {};
            }
        },
        async graphql(query, variables) {
            recordGraphQLCall({ query, variables });
            return { createCommitOnBranch: { commit: { oid: 'signed-release-head' } } };
        },
        headers: { authorization: 'Bearer token' },
        owner: 'owner',
        repo: 'repo',
        repositoryNameWithOwner: 'owner/repo'
    };
}

function createReleaseCommitInput(): CreateCommitOnBranchInput {
    return {
        additions: [{ contents: encodedChangelogContent, path: 'CHANGELOG.md' }],
        branch: 'release/packtory',
        expectedHeadOid: 'main-head',
        message: 'Release packages'
    };
}

async function createReleaseCommitWithBranchHead(currentBranchHead: string | undefined): Promise<CommitScenarioResult> {
    const operations: GitOperation[] = [];
    const graphQLCalls: GraphQLCall[] = [];
    const client = createReleasePullRequestCommitClient(
        createDependencies(
            currentBranchHead,
            function (operation) {
                operations.push(operation);
            },
            function (call) {
                graphQLCalls.push(call);
            }
        )
    );
    return {
        graphQLCalls,
        operations,
        releaseHead: await client.createCommitOnBranch(createReleaseCommitInput())
    };
}

suite('release-pr-branch-commit', function () {
    test('creates GitHub-signed release commits on the release branch', async function () {
        const { graphQLCalls, operations, releaseHead } = await createReleaseCommitWithBranchHead('old-release-head');

        assert.strictEqual(releaseHead, 'signed-release-head');
        assert.deepStrictEqual(
            operations.map(function (operation) {
                return operation.name;
            }),
            ['getRef', 'updateRef']
        );
        assert.deepStrictEqual(operations[0]?.input, {
            headers: { authorization: 'Bearer token' },
            owner: 'owner',
            ref: 'heads/release/packtory',
            repo: 'repo'
        });
        assert.deepStrictEqual(operations[1]?.input, {
            force: true,
            headers: { authorization: 'Bearer token' },
            owner: 'owner',
            ref: 'heads/release/packtory',
            repo: 'repo',
            sha: 'main-head'
        });
        assert.deepStrictEqual(graphQLCalls[0]?.variables, {
            additions: [{ contents: encodedChangelogContent, path: 'CHANGELOG.md' }],
            branchName: 'release/packtory',
            expectedHeadOid: 'main-head',
            headline: 'Release packages',
            repositoryNameWithOwner: 'owner/repo'
        });
        assert.match(graphQLCalls[0].query, /createCommitOnBranch/u);
    });

    test('creates the release branch before the first GitHub-signed commit', async function () {
        const { graphQLCalls, operations, releaseHead } = await createReleaseCommitWithBranchHead(undefined);

        assert.strictEqual(releaseHead, 'signed-release-head');
        assert.deepStrictEqual(
            operations.map(function (operation) {
                return operation.name;
            }),
            ['getRef', 'createRef']
        );
        assert.deepStrictEqual(operations[1]?.input, {
            headers: { authorization: 'Bearer token' },
            owner: 'owner',
            ref: 'refs/heads/release/packtory',
            repo: 'repo',
            sha: 'main-head'
        });
        assert.strictEqual(graphQLCalls.length, 1);
    });

    test('keeps the release branch when it already points at the expected head', async function () {
        const { graphQLCalls, operations, releaseHead } = await createReleaseCommitWithBranchHead('main-head');

        assert.strictEqual(releaseHead, 'signed-release-head');
        assert.deepStrictEqual(
            operations.map(function (operation) {
                return operation.name;
            }),
            ['getRef']
        );
        assert.strictEqual(graphQLCalls.length, 1);
    });

    test('reports non-missing GitHub ref lookup failures', async function () {
        const client = createReleasePullRequestCommitClient({
            ...createDependencies(
                'main-head',
                function () {
                    return undefined;
                },
                function () {
                    return undefined;
                }
            ),
            git: {
                async createRef() {
                    return {};
                },
                async getRef() {
                    const error = new Error('Server error');
                    Object.assign(error, {
                        request: { url: 'https://api.github.com/repos/owner/repo/git/ref/heads/release%2Fpacktory' },
                        status: 500
                    });
                    throw error;
                },
                async updateRef() {
                    return {};
                }
            }
        });

        await assert.rejects(async function () {
            await client.createCommitOnBranch(createReleaseCommitInput());
        }, /GitHub API request failed \(500\) for \/repos\/owner\/repo\/git\/ref\/heads\/release%2Fpacktory/u);
    });
});
