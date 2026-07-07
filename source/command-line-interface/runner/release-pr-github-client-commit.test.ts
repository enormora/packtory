import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    captureRequests,
    createClient,
    createRecordedRouteFetch,
    emptyResponse,
    hasRequestWithBody,
    jsonResponse,
    readHeader,
    routeKey,
    type RecordedRequest
} from '../../test-libraries/release-pr-github-client-test-support.ts';
import type { ReleasePullRequestGitHubClient } from './release-pr-github-client.ts';

type CommitScenario = {
    readonly client: ReleasePullRequestGitHubClient;
    readonly encodedBranchRef: string;
    readonly encodedContent: string;
    readonly encodedTemporaryBranchRef: string;
    readonly records: readonly RecordedRequest[];
};

function createCommitScenario(): CommitScenario {
    const capturedRequests = captureRequests();
    const encodedBranchRef = encodeURIComponent('heads/release/packtory');
    const encodedTemporaryBranchRef = encodeURIComponent(
        'heads/packtory-release-pr-staging-release-packtory-ebb84e32ba80-main-head'
    );
    const encodedContent = Buffer.from('changelog\n', 'utf8').toString('base64');
    const client = createClient(
        createRecordedRouteFetch(
            capturedRequests,
            new Map([
                [
                    routeKey('GET', `/repos/owner/repo/git/ref/${encodedTemporaryBranchRef}`),
                    function () {
                        return jsonResponse({ object: { sha: 'old-temporary-head' } });
                    }
                ],
                [ routeKey('PATCH', `/repos/owner/repo/git/refs/${encodedTemporaryBranchRef}`), emptyResponse ],
                [ routeKey('PATCH', `/repos/owner/repo/git/refs/${encodedBranchRef}`), emptyResponse ],
                [
                    routeKey('GET', `/repos/owner/repo/git/ref/${encodedBranchRef}`),
                    function () {
                        return jsonResponse({ object: { sha: 'old-release-head' } });
                    }
                ],
                [ routeKey('DELETE', `/repos/owner/repo/git/refs/${encodedTemporaryBranchRef}`), emptyResponse ],
                [
                    routeKey('POST', '/graphql'),
                    function () {
                        return jsonResponse({
                            data: { createCommitOnBranch: { commit: { oid: 'signed-release-head' } } }
                        });
                    }
                ]
            ])
        )
    );
    return { client, encodedBranchRef, encodedContent, encodedTemporaryBranchRef, records: capturedRequests.records };
}

function assertBranchWasMoved(records: readonly RecordedRequest[], encodedBranchRef: string, sha: string): void {
    assert.strictEqual(
        hasRequestWithBody(records, 'PATCH', `/repos/owner/repo/git/refs/${encodedBranchRef}`, `"sha":"${sha}"`),
        true
    );
}

function assertBranchWasDeleted(records: readonly RecordedRequest[], encodedBranchRef: string): void {
    assert.strictEqual(
        records.some(function (record) {
            return record.method === 'DELETE' && record.path === `/repos/owner/repo/git/refs/${encodedBranchRef}`;
        }),
        true
    );
}

function assertGraphQLCommitRequest(records: readonly RecordedRequest[], encodedContent: string): void {
    assert.strictEqual(hasRequestWithBody(records, 'POST', '/graphql', '"repositoryNameWithOwner":"owner/repo"'), true);
    assert.strictEqual(hasRequestWithBody(records, 'POST', '/graphql', `"contents":"${encodedContent}"`), true);
    assert.strictEqual(hasRequestWithBody(records, 'POST', '/graphql', 'mutation CreateCommitOnBranch'), true);
}

function assertGitHubHeaders(records: readonly RecordedRequest[]): void {
    assert.strictEqual(readHeader(records[0]?.headers, 'accept'), 'application/vnd.github+json');
    assert.strictEqual(readHeader(records[0]?.headers, 'authorization'), 'Bearer token');
    assert.strictEqual(readHeader(records[0]?.headers, 'x-github-api-version'), '2022-11-28');
}

suite('release-pr-github-client-commit', function () {
    test('creates signed release commits through GitHub', async function () {
        const { client, encodedBranchRef, encodedContent, encodedTemporaryBranchRef, records } = createCommitScenario();
        assert.strictEqual(
            await client.createCommitOnBranch({
                additions: [ { contents: encodedContent, path: 'CHANGELOG.md' } ],
                branch: 'release/packtory',
                expectedHeadOid: 'main-head',
                message: 'Release packages'
            }),
            'signed-release-head'
        );
        assertBranchWasMoved(records, encodedTemporaryBranchRef, 'main-head');
        assertBranchWasMoved(records, encodedBranchRef, 'signed-release-head');
        assertBranchWasDeleted(records, encodedTemporaryBranchRef);
        assertGraphQLCommitRequest(records, encodedContent);
        assertGitHubHeaders(records);
    });
});
