import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    captureRequests,
    createClientWithToken,
    createRecordedRouteFetch,
    emptyResponse,
    hasRequestWithBody,
    javaScriptObjectNotationResponse,
    readHeader,
    routeKey,
    type RecordedRequest
} from '../../test-libraries/release-pull-request-github-client-test-support.ts';
import type { ReleasePullRequestGitHubClient } from './release-pull-request-github-client.ts';

type CommitScenario = {
    readonly client: ReleasePullRequestGitHubClient;
    readonly encodedBranchReference: string;
    readonly encodedContent: string;
    readonly encodedTemporaryBranchReference: string;
    readonly records: readonly RecordedRequest[];
};

function existingReference(hash: string): Response {
    return javaScriptObjectNotationResponse({ object: { hash } });
}

function missingReference(): Response {
    return new Response('', { status: 404 });
}

function createCommitScenarioWithToken(
    token: string | undefined,
    readReference: (hash: string) => Response
): CommitScenario {
    const capturedRequests = captureRequests();
    const encodedBranchReference = encodeURIComponent('heads/release/packtory');
    const encodedTemporaryBranchReference = encodeURIComponent(
        'heads/packtory-release-pull-request-staging-release-packtory-ebb84e32ba80-main-head'
    );
    const encodedContent = Buffer.from('changelog\n', 'utf8').toString('base64');
    const client = createClientWithToken(
        createRecordedRouteFetch(
            capturedRequests,
            new Map([
                [
                    routeKey('GET', `/repos/owner/repo/git/ref/${encodedTemporaryBranchReference}`),
                    function () {
                        return readReference('old-temporary-head');
                    }
                ],
                [ routeKey('PATCH', `/repos/owner/repo/git/refs/${encodedTemporaryBranchReference}`), emptyResponse ],
                [ routeKey('PATCH', `/repos/owner/repo/git/refs/${encodedBranchReference}`), emptyResponse ],
                [ routeKey('POST', '/repos/owner/repo/git/refs'), emptyResponse ],
                [
                    routeKey('GET', `/repos/owner/repo/git/ref/${encodedBranchReference}`),
                    function () {
                        return readReference('old-release-head');
                    }
                ],
                [ routeKey('DELETE', `/repos/owner/repo/git/refs/${encodedTemporaryBranchReference}`), emptyResponse ],
                [
                    routeKey('POST', '/graphql'),
                    function () {
                        return javaScriptObjectNotationResponse({
                            data: { createCommitOnBranch: { commit: { objectIdentifier: 'signed-release-head' } } }
                        });
                    }
                ]
            ])
        ),
        token
    );
    return {
        client,
        encodedBranchReference,
        encodedContent,
        encodedTemporaryBranchReference,
        records: capturedRequests.records
    };
}

function createCommitScenario(): CommitScenario {
    return createCommitScenarioWithToken('token', existingReference);
}

function assertBranchWasMoved(records: readonly RecordedRequest[], encodedBranchReference: string, hash: string): void {
    assert.strictEqual(
        hasRequestWithBody(records, 'PATCH', `/repos/owner/repo/git/refs/${encodedBranchReference}`, `"sha":"${hash}"`),
        true
    );
}

function assertBranchWasDeleted(records: readonly RecordedRequest[], encodedBranchReference: string): void {
    assert.strictEqual(
        records.some(function (record) {
            return record.method === 'DELETE' && record.path === `/repos/owner/repo/git/refs/${encodedBranchReference}`;
        }),
        true
    );
}

function assertGraphQLCommitRequest(records: readonly RecordedRequest[], encodedContent: string): void {
    assert.strictEqual(hasRequestWithBody(records, 'POST', '/graphql', '"repositoryNameWithOwner":"owner/repo"'), true);
    assert.strictEqual(hasRequestWithBody(records, 'POST', '/graphql', `"contents":"${encodedContent}"`), true);
    assert.strictEqual(hasRequestWithBody(records, 'POST', '/graphql', 'mutation CreateCommitOnBranch'), true);
}

function findGraphQLRequest(records: readonly RecordedRequest[]): RecordedRequest {
    const request = records.find(function (record) {
        return record.method === 'POST' && record.path === '/graphql';
    });
    if (request === undefined) {
        throw new Error('Expected a GraphQL request');
    }
    return request;
}

function assertGitHubHeaders(records: readonly RecordedRequest[]): void {
    assert.strictEqual(readHeader(records[0]?.headers, 'accept'), 'application/vnd.github+json');
    assert.strictEqual(readHeader(records[0]?.headers, 'authorization'), 'Bearer token');
    assert.strictEqual(readHeader(records[0]?.headers, 'x-github-api-version'), '2022-11-28');
    assert.strictEqual(readHeader(findGraphQLRequest(records).headers, 'authorization'), 'Bearer token');
}

suite('release-pull-request-github-client-commit', function () {
    test('creates signed release commits through GitHub', async function () {
        const { client, encodedBranchReference, encodedContent, encodedTemporaryBranchReference, records } =
            createCommitScenario();
        assert.strictEqual(
            await client.createCommitOnBranch({
                additions: [ { contents: encodedContent, path: 'CHANGELOG.md' } ],
                branch: 'release/packtory',
                expectedHeadObjectIdentifier: 'main-head',
                message: 'Release packages'
            }),
            'signed-release-head'
        );
        assertBranchWasMoved(records, encodedTemporaryBranchReference, 'main-head');
        assertBranchWasMoved(records, encodedBranchReference, 'signed-release-head');
        assertBranchWasDeleted(records, encodedTemporaryBranchReference);
        assertGraphQLCommitRequest(records, encodedContent);
        assertGitHubHeaders(records);
    });

    test('creates signed release commits without authentication when no token is set', async function () {
        const { client, encodedContent, records } = createCommitScenarioWithToken(undefined, existingReference);

        assert.strictEqual(
            await client.createCommitOnBranch({
                additions: [ { contents: encodedContent, path: 'CHANGELOG.md' } ],
                branch: 'release/packtory',
                expectedHeadObjectIdentifier: 'main-head',
                message: 'Release packages'
            }),
            'signed-release-head'
        );
        assert.strictEqual(readHeader(records[0]?.headers, 'authorization'), undefined);
        assert.strictEqual(readHeader(findGraphQLRequest(records).headers, 'authorization'), undefined);
    });

    suite('release branch creation', function () {
        test('creates missing temporary and release references with the expected hashes', async function () {
            const { client, records, encodedContent } = createCommitScenarioWithToken('token', missingReference);
            assert.strictEqual(
                await client.createCommitOnBranch({
                    additions: [ { contents: encodedContent, path: 'CHANGELOG.md' } ],
                    branch: 'release/packtory',
                    expectedHeadObjectIdentifier: 'main-head',
                    message: 'Release packages'
                }),
                'signed-release-head'
            );
            assert.strictEqual(
                hasRequestWithBody(
                    records,
                    'POST',
                    '/repos/owner/repo/git/refs',
                    '"ref":"refs/heads/packtory-release-pull-request-staging-release-packtory-ebb84e32ba80-main-head"'
                ),
                true
            );
            assert.strictEqual(
                hasRequestWithBody(records, 'POST', '/repos/owner/repo/git/refs', '"sha":"main-head"'),
                true
            );
            assert.strictEqual(
                hasRequestWithBody(
                    records,
                    'POST',
                    '/repos/owner/repo/git/refs',
                    '"ref":"refs/heads/release/packtory"'
                ),
                true
            );
            assert.strictEqual(
                hasRequestWithBody(records, 'POST', '/repos/owner/repo/git/refs', '"sha":"signed-release-head"'),
                true
            );
        });
    });
});
