import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    createFetchFromRoutes,
    emptyResponse,
    hasRequestWithBody,
    jsonResponse,
    readHeader,
    routeKey,
    type RecordedRequest
} from '../../test-libraries/github-client-fetch-fixtures.ts';
import {
    createReleasePullRequestGitHubClient,
    type ReleasePullRequestGitHubClient
} from './release-pr-github-client.ts';

type CommitScenario = {
    readonly client: ReleasePullRequestGitHubClient;
    readonly encodedBranchRef: string;
    readonly encodedContent: string;
    readonly records: readonly RecordedRequest[];
};

function createCommitScenario(): CommitScenario {
    const records: RecordedRequest[] = [];
    const encodedBranchRef = encodeURIComponent('heads/release/packtory');
    const encodedContent = Buffer.from('changelog\n', 'utf8').toString('base64');
    const client = createReleasePullRequestGitHubClient({
        fetch: createFetchFromRoutes(
            records,
            new Map([
                [
                    routeKey('GET', `/repos/owner/repo/git/ref/${encodedBranchRef}`),
                    function () {
                        return jsonResponse({ object: { sha: 'old-release-head' } });
                    }
                ],
                [routeKey('PATCH', `/repos/owner/repo/git/refs/${encodedBranchRef}`), emptyResponse],
                [
                    routeKey('POST', '/graphql'),
                    function () {
                        return jsonResponse({
                            data: { createCommitOnBranch: { commit: { oid: 'signed-release-head' } } }
                        });
                    }
                ]
            ])
        ),
        owner: 'owner',
        repo: 'repo',
        token: 'token'
    });
    return { client, encodedBranchRef, encodedContent, records };
}

suite('release-pr-github-client-commit', function () {
    test('creates signed release commits through GitHub', async function () {
        const { client, encodedBranchRef, encodedContent, records } = createCommitScenario();
        assert.strictEqual(
            await client.createCommitOnBranch({
                additions: [{ contents: encodedContent, path: 'CHANGELOG.md' }],
                branch: 'release/packtory',
                expectedHeadOid: 'main-head',
                message: 'Release packages'
            }),
            'signed-release-head'
        );
        assert.strictEqual(
            hasRequestWithBody(records, 'PATCH', `/repos/owner/repo/git/refs/${encodedBranchRef}`, '"sha":"main-head"'),
            true
        );
        assert.strictEqual(
            hasRequestWithBody(records, 'POST', '/graphql', '"repositoryNameWithOwner":"owner/repo"'),
            true
        );
        assert.strictEqual(hasRequestWithBody(records, 'POST', '/graphql', `"contents":"${encodedContent}"`), true);
        assert.strictEqual(hasRequestWithBody(records, 'POST', '/graphql', 'mutation CreateCommitOnBranch'), true);
        assert.strictEqual(readHeader(records[0]?.headers, 'accept'), 'application/vnd.github+json');
        assert.strictEqual(readHeader(records[0]?.headers, 'authorization'), 'Bearer token');
        assert.strictEqual(readHeader(records[0]?.headers, 'x-github-api-version'), '2022-11-28');
    });
});
