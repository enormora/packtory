import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    createClient,
    createPullRequest,
    createRouteFetch,
    jsonResponse,
    routeKey
} from '../../test-libraries/release-pr-github-client-test-support.ts';

suite('release-pr-github-client responses', function () {
    test('normalizes nullable GitHub response fields', async function () {
        const client = createClient(createRouteFetch(
            new Map([
                [ routeKey('GET', '/repos/owner/repo/pulls/12'), function () {
                    return jsonResponse(createPullRequest(12, {
                        head: { ref: 'release/packtory', repo: null, sha: 'release-head' },
                        labels: [ { name: null }, {} ],
                        merge_commit_sha: null,
                        merged_at: null,
                        user: null
                    }));
                } ],
                [ routeKey('GET', '/repos/owner/repo/pulls/13'), function () {
                    return jsonResponse(createPullRequest(13, { merge_commit_sha: null, merged_at: undefined }));
                } ],
                [ routeKey('GET', '/repos/owner/repo/pulls/12/files'), function () {
                    return jsonResponse([]);
                } ],
                [ routeKey('GET', '/repos/owner/repo/pulls/13/files'), function () {
                    return jsonResponse([]);
                } ],
                [ routeKey('GET', '/repos/owner/repo/commits/release-head'), function () {
                    return jsonResponse({ commit: { message: 'Release packages\n\nDetails' }, parents: [] });
                } ]
            ])
        ));

        assert.deepStrictEqual(await client.getPullRequest(12), {
            author: '',
            baseRef: 'main',
            changedFiles: [],
            headRef: 'release/packtory',
            headRepository: '',
            labels: [],
            mergeCommitSha: undefined,
            merged: false,
            number: 12,
            subject: 'Release packages',
            title: 'Prepare release'
        });
        const pullRequestWithOmittedMergeTimestamp = await client.getPullRequest(13);
        assert.strictEqual(pullRequestWithOmittedMergeTimestamp.merged, false);
    });

    test('formats failed GitHub API requests with the endpoint path', async function () {
        const client = createClient(async function () {
            return jsonResponse({ message: 'Bad credentials' }, 401);
        });

        await assert.rejects(
            async function () {
                await client.getBranchHeadSha('main');
            },
            function (error: unknown) {
                assert.ok(error instanceof Error);
                assert.strictEqual(
                    error.message,
                    'GitHub API request failed (401) for /repos/owner/repo/branches/main: Bad credentials'
                );
                assert.ok(error.cause instanceof Error);
                return true;
            }
        );
    });
});
