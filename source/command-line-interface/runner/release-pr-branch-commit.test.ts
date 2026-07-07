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
type GraphQLBehavior = 'fail' | 'succeed';

const encodedChangelogContent = Buffer.from('updated changelog\n', 'utf8').toString('base64');
const missingGitHubResourceStatusCode = 404;
const releaseBranchRef = 'heads/release/packtory';
const temporaryReleaseBranch = 'packtory-release-pr-staging-release-packtory-ebb84e32ba80-main-head';
const temporaryReleaseBranchRef = `heads/${temporaryReleaseBranch}`;

function createMissingRefError(ref: string): Error {
    const error = new Error('Not Found');
    Object.assign(error, {
        request: {
            url: [
                'https://api.github.com/repos/owner/repo/git/ref/',
                encodeURIComponent(ref)
            ]
                .join('')
        },
        status: missingGitHubResourceStatusCode
    });
    return error;
}

function createDependencies(
    currentBranchHead: string | undefined,
    graphQLBehavior: GraphQLBehavior,
    recordOperation: (operation: GitOperation) => void,
    recordGraphQLCall: (call: GraphQLCall) => void
): ReleasePullRequestCommitClientDependencies {
    return {
        git: {
            async createRef(input) {
                recordOperation({ input, name: 'createRef' });
                return {};
            },
            async deleteRef(input) {
                recordOperation({ input, name: 'deleteRef' });
                return {};
            },
            async getRef(input) {
                recordOperation({ input, name: 'getRef' });
                const { ref } = input;
                if (currentBranchHead === undefined) {
                    throw createMissingRefError(ref);
                }
                if (ref === temporaryReleaseBranchRef) {
                    return { data: { object: { sha: currentBranchHead } } };
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
            if (graphQLBehavior === 'fail') {
                const error = new Error('Resource not accessible by integration');
                Object.assign(error, {
                    errors: [ { message: 'ref update failed because the token cannot bypass a ruleset' } ],
                    request: { url: 'https://api.github.com/graphql' },
                    status: 403
                });
                throw error;
            }
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
        additions: [ { contents: encodedChangelogContent, path: 'CHANGELOG.md' } ],
        branch: 'release/packtory',
        expectedHeadOid: 'main-head',
        message: 'Release packages'
    };
}

function createReleaseCommitInputWithBranch(branch: string): CreateCommitOnBranchInput {
    return {
        ...createReleaseCommitInput(),
        branch
    };
}

async function createReleaseCommitWithBranchHead(currentBranchHead: string | undefined): Promise<CommitScenarioResult> {
    const operations: GitOperation[] = [];
    const graphQLCalls: GraphQLCall[] = [];
    const client = createReleasePullRequestCommitClient(
        createDependencies(
            currentBranchHead,
            'succeed',
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
            [ 'getRef', 'updateRef', 'getRef', 'updateRef', 'deleteRef' ]
        );
        assert.deepStrictEqual(operations[0]?.input, {
            headers: { authorization: 'Bearer token' },
            owner: 'owner',
            ref: temporaryReleaseBranchRef,
            repo: 'repo'
        });
        assert.deepStrictEqual(operations[1]?.input, {
            force: true,
            headers: { authorization: 'Bearer token' },
            owner: 'owner',
            ref: temporaryReleaseBranchRef,
            repo: 'repo',
            sha: 'main-head'
        });
        assert.deepStrictEqual(operations[3]?.input, {
            force: true,
            headers: { authorization: 'Bearer token' },
            owner: 'owner',
            ref: releaseBranchRef,
            repo: 'repo',
            sha: 'signed-release-head'
        });
        assert.deepStrictEqual(operations[4]?.input, {
            headers: { authorization: 'Bearer token' },
            owner: 'owner',
            ref: temporaryReleaseBranchRef,
            repo: 'repo'
        });
        assert.deepStrictEqual(graphQLCalls[0]?.variables, {
            additions: [ { contents: encodedChangelogContent, path: 'CHANGELOG.md' } ],
            branchName: temporaryReleaseBranch,
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
            [ 'getRef', 'createRef', 'getRef', 'createRef', 'deleteRef' ]
        );
        assert.deepStrictEqual(operations[1]?.input, {
            headers: { authorization: 'Bearer token' },
            owner: 'owner',
            ref: `refs/heads/${temporaryReleaseBranch}`,
            repo: 'repo',
            sha: 'main-head'
        });
        assert.deepStrictEqual(operations[3]?.input, {
            headers: { authorization: 'Bearer token' },
            owner: 'owner',
            ref: 'refs/heads/release/packtory',
            repo: 'repo',
            sha: 'signed-release-head'
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
            [ 'getRef', 'getRef', 'updateRef', 'deleteRef' ]
        );
        assert.strictEqual(graphQLCalls.length, 1);
    });

    test('uses stable non-conflicting temporary branch names', async function () {
        const graphQLCalls: GraphQLCall[] = [];
        const client = createReleasePullRequestCommitClient(
            createDependencies(
                'old-release-head',
                'succeed',
                function () {
                    return undefined;
                },
                function (call) {
                    graphQLCalls.push(call);
                }
            )
        );
        const longReleaseBranch = `release/${'a'.repeat(90)}`;
        const cases = [
            {
                branch: 'release/packtory',
                expectedHeadOid: '0123456789abcdef',
                temporaryBranch: 'packtory-release-pr-staging-release-packtory-ebb84e32ba80-0123456789ab'
            },
            {
                branch: '!release/wyvern-ledger!',
                expectedHeadOid: 'main-head',
                temporaryBranch: 'packtory-release-pr-staging-release-wyvern-ledger-79732f82875d-main-head'
            },
            {
                branch: '!!!',
                expectedHeadOid: 'main-head',
                temporaryBranch: 'packtory-release-pr-staging-branch-e84c538e7fe2-main-head'
            },
            {
                branch: 'release//wyvern-ledger',
                expectedHeadOid: 'main-head',
                temporaryBranch: 'packtory-release-pr-staging-release-wyvern-ledger-6a221e54a88c-main-head'
            },
            {
                branch: longReleaseBranch,
                expectedHeadOid: 'main-head',
                temporaryBranch: [
                    'packtory-release-pr-staging-release-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                    '15cd0726021a-main-head'
                ]
                    .join('-')
            }
        ];

        for (const testCase of cases) {
            assert.strictEqual(
                await client.createCommitOnBranch({
                    ...createReleaseCommitInputWithBranch(testCase.branch),
                    expectedHeadOid: testCase.expectedHeadOid
                }),
                'signed-release-head'
            );
        }
        assert.deepStrictEqual(
            graphQLCalls.map(function (call) {
                return call.variables.branchName;
            }),
            cases.map(function (testCase) {
                return testCase.temporaryBranch;
            })
        );
    });

    test('creates a non-conflicting temporary branch when the release branch has slash prefixes', async function () {
        const events: string[] = [];
        const client = createReleasePullRequestCommitClient({
            ...createDependencies(
                'old-release-head',
                'succeed',
                function () {
                    return undefined;
                },
                function () {
                    return undefined;
                }
            ),
            git: {
                async createRef(input) {
                    events.push(`createRef:${input.ref}`);
                    return {};
                },
                async deleteRef(input) {
                    events.push(`deleteRef:${input.ref}`);
                    return {};
                },
                async getRef(input) {
                    events.push(`getRef:${input.ref}`);
                    if (input.ref === 'heads/release/wyvern-ledger') {
                        return { data: { object: { sha: 'old-release-head' } } };
                    }
                    throw createMissingRefError(input.ref);
                },
                async updateRef(input) {
                    events.push(`updateRef:${input.ref}:${input.sha}`);
                    return {};
                }
            },
            async graphql(query, variables) {
                events.push(`graphql:${String(variables.branchName)}`);
                assert.match(query, /createCommitOnBranch/u);
                return { createCommitOnBranch: { commit: { oid: 'signed-release-head' } } };
            }
        });

        assert.strictEqual(
            await client.createCommitOnBranch(createReleaseCommitInputWithBranch('release/wyvern-ledger')),
            'signed-release-head'
        );
        assert.deepStrictEqual(events, [
            'getRef:heads/packtory-release-pr-staging-release-wyvern-ledger-6d45f8088f71-main-head',
            'createRef:refs/heads/packtory-release-pr-staging-release-wyvern-ledger-6d45f8088f71-main-head',
            'graphql:packtory-release-pr-staging-release-wyvern-ledger-6d45f8088f71-main-head',
            'getRef:heads/release/wyvern-ledger',
            'updateRef:heads/release/wyvern-ledger:signed-release-head',
            'deleteRef:heads/packtory-release-pr-staging-release-wyvern-ledger-6d45f8088f71-main-head'
        ]);
        assert.strictEqual(
            events.some(function (event) {
                return event.includes('refs/heads/release/wyvern-ledger/');
            }),
            false
        );
    });

    test('does not move the release branch when GitHub commit creation fails', async function () {
        const operations: GitOperation[] = [];
        const graphQLCalls: GraphQLCall[] = [];
        const client = createReleasePullRequestCommitClient(
            createDependencies(
                'old-release-head',
                'fail',
                function (operation) {
                    operations.push(operation);
                },
                function (call) {
                    graphQLCalls.push(call);
                }
            )
        );

        await assert.rejects(
            async function () {
                await client.createCommitOnBranch(createReleaseCommitInput());
            },
            /GitHub API request failed \(403\) for \/graphql: Resource not accessible by integration; ref update failed because the token cannot bypass a ruleset/u
        );
        assert.deepStrictEqual(graphQLCalls[0]?.variables.branchName, temporaryReleaseBranch);
        assert.deepStrictEqual(
            operations.map(function (operation) {
                return operation.name;
            }),
            [ 'getRef', 'updateRef', 'deleteRef' ]
        );
        assert.strictEqual(
            operations.some(function (operation) {
                return operation.name === 'updateRef' && operation.input.ref === releaseBranchRef;
            }),
            false
        );
        assert.strictEqual(
            operations.some(function (operation) {
                return operation.name === 'createRef' && operation.input.ref === 'refs/heads/release/packtory';
            }),
            false
        );
    });

    test('reports non-missing GitHub ref lookup failures', async function () {
        const client = createReleasePullRequestCommitClient({
            ...createDependencies(
                'main-head',
                'succeed',
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
                async deleteRef() {
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
