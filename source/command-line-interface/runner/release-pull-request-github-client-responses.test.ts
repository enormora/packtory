import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    createClient,
    createPullRequest,
    createRouteFetch,
    javaScriptObjectNotationResponse,
    routeKey
} from '../../test-libraries/release-pull-request-github-client-test-support.ts';

suite('release-pull-request-github-client responses', function () {
    test('normalizes nullable GitHub response fields', async function () {
        const client = createClient(createRouteFetch(
            new Map([
                [ routeKey('GET', '/repos/owner/repo/pulls/12'), function () {
                    return javaScriptObjectNotationResponse(createPullRequest(12, {
                        head: { reference: 'release/packtory', repository: null, hash: 'release-head' },
                        labels: [ { name: null }, {} ],
                        merge_commit_hash: null,
                        merged_at: null,
                        user: null
                    }));
                } ],
                [ routeKey('GET', '/repos/owner/repo/pulls/13'), function () {
                    return javaScriptObjectNotationResponse(
                        createPullRequest(13, { merge_commit_hash: null, merged_at: undefined })
                    );
                } ],
                [ routeKey('GET', '/repos/owner/repo/pulls/12/files'), function () {
                    return javaScriptObjectNotationResponse([]);
                } ],
                [ routeKey('GET', '/repos/owner/repo/pulls/13/files'), function () {
                    return javaScriptObjectNotationResponse([]);
                } ],
                [ routeKey('GET', '/repos/owner/repo/commits/release-head'), function () {
                    return javaScriptObjectNotationResponse({
                        commit: { message: 'Release packages\n\nDetails' },
                        parents: []
                    });
                } ]
            ])
        ));

        assert.deepStrictEqual(await client.getPullRequest(12), {
            author: '',
            baseReference: 'main',
            changedFiles: [],
            headReference: 'release/packtory',
            headRepository: '',
            labels: [],
            mergeCommitHash: undefined,
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
            return javaScriptObjectNotationResponse({ message: 'Bad credentials' }, 401);
        });

        await assert.rejects(
            async function () {
                await client.getBranchHeadHash('main');
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
