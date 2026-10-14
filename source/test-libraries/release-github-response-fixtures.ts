import assert from 'node:assert';
import { fake } from 'sinon';
import {
    createReleasePullRequestGitHubClient,
    type ReleasePullRequestGitHubClient
} from '../command-line-interface/runner/release-pull-request-github-client.ts';
import {
    createClient,
    createCommit,
    createPullRequest,
    createRecordedRouteFetch,
    emptyResponse,
    javaScriptObjectNotationResponse,
    requestHasSearchParameter,
    routeKey,
    type CapturedRequests,
    type RecordedRequest,
    type RouteResponse
} from './release-pull-request-github-client-test-support.ts';

const defaultRoutes: ReadonlyMap<string, RouteResponse> = new Map([
    [ routeKey('GET', '/repos/owner/repo/pulls'), function () {
        return javaScriptObjectNotationResponse([ createPullRequest(1) ]);
    } ],
    [ routeKey('POST', '/repos/owner/repo/pulls'), function () {
        return javaScriptObjectNotationResponse(createPullRequest(2));
    } ],
    [ routeKey('PATCH', '/repos/owner/repo/pulls/1'), function () {
        return javaScriptObjectNotationResponse(createPullRequest(1));
    } ],
    [ routeKey('GET', '/repos/owner/repo/pulls/12'), function () {
        return javaScriptObjectNotationResponse(createPullRequest(12));
    } ],
    [ routeKey('GET', '/repos/owner/repo/pulls/12/files'), function () {
        return javaScriptObjectNotationResponse([ { filename: 'CHANGELOG.md' } ]);
    } ],
    [ routeKey('GET', '/repos/owner/repo/pulls/1/files'), function () {
        return javaScriptObjectNotationResponse([ { filename: 'CHANGELOG.md' } ]);
    } ],
    [ routeKey('GET', '/repos/owner/repo/commits/release-head'), function () {
        return javaScriptObjectNotationResponse(createCommit());
    } ],
    [ routeKey('GET', '/repos/owner/repo/commits/merge-sha/pulls'), function () {
        return javaScriptObjectNotationResponse([ createPullRequest(12) ]);
    } ],
    [ routeKey('PUT', '/repos/owner/repo/issues/1/labels'), function () {
        return javaScriptObjectNotationResponse([ { name: 'release' } ]);
    } ],
    [ routeKey('POST', '/repos/owner/repo/statuses/release-head'), function () {
        return javaScriptObjectNotationResponse({});
    } ],
    [ routeKey('GET', '/repos/owner/repo/actions/runs'), function () {
        return javaScriptObjectNotationResponse({
            workflow_runs: [
                { conclusion: 'action_required', database_id: 10, event: 'pull_request', head_sha: 'release-head' },
                { conclusion: 'action_required', event: 'pull_request', head_sha: 'release-head' },
                { conclusion: 'action_required', database_id: 12, event: 'pull_request', head_sha: 'other-head' },
                {
                    conclusion: null,
                    database_id: 14,
                    event: 'pull_request',
                    head_sha: 'release-head',
                    status: 'waiting'
                },
                {
                    conclusion: null,
                    database_id: 15,
                    event: 'pull_request',
                    head_sha: 'release-head',
                    status: 'pending'
                },
                {
                    conclusion: null,
                    database_id: 17,
                    event: 'pull_request',
                    head_sha: 'release-head',
                    status: 'requested'
                },
                {
                    conclusion: null,
                    database_id: 16,
                    event: 'workflow_dispatch',
                    head_sha: 'release-head',
                    status: 'waiting'
                },
                { conclusion: 'success', database_id: 13, event: 'pull_request', head_sha: 'release-head' },
                { conclusion: 'success', database_id: 11, event: 'workflow_dispatch', head_sha: 'release-head' }
            ]
        });
    } ],
    [ routeKey('GET', '/repos/owner/repo/actions/workflows'), function () {
        return javaScriptObjectNotationResponse({
            workflows: [
                { identifier: 101, name: 'ci', path: '.github/workflows/continuous-integration.yml' },
                { identifier: 102, name: 'ci-db', path: '.github/workflows/ci-db.yml' }
            ]
        });
    } ],
    [ routeKey('DELETE', '/repos/owner/repo/actions/runs/10'), emptyResponse ],
    [ routeKey('DELETE', '/repos/owner/repo/actions/runs/14'), emptyResponse ],
    [ routeKey('DELETE', '/repos/owner/repo/actions/runs/15'), emptyResponse ],
    [ routeKey('DELETE', '/repos/owner/repo/actions/runs/17'), emptyResponse ],
    [ routeKey('DELETE', `/repos/owner/repo/git/refs/${encodeURIComponent('heads/release/packtory')}`), emptyResponse ],
    [ routeKey('GET', '/repos/owner/repo/actions/runs/11'), function () {
        return javaScriptObjectNotationResponse({ conclusion: 'success' });
    } ],
    [ routeKey('GET', '/repos/owner/repo/actions/runs/12'), function () {
        return javaScriptObjectNotationResponse({ conclusion: null });
    } ],
    [ routeKey('GET', '/repos/owner/repo/actions/runs/11/jobs'), function () {
        return javaScriptObjectNotationResponse({
            jobs: [ { conclusion: 'success', html_url: 'https://run/job', name: 'Node.js' } ],
            total_count: 1
        });
    } ],
    [ routeKey('GET', '/repos/owner/repo/actions/runs/12/jobs'), function () {
        return javaScriptObjectNotationResponse({
            jobs: [ { conclusion: null, html_url: null, name: 'Node.js' } ],
            total_count: 1
        });
    } ],
    [ routeKey('POST', '/repos/owner/repo/actions/workflows/101/dispatches'), emptyResponse ],
    [ routeKey('GET', '/repos/owner/repo/actions/workflows/101/runs'), function () {
        return javaScriptObjectNotationResponse({
            workflow_runs: [ { database_id: 11, event: 'workflow_dispatch', head_sha: 'release-head' } ]
        });
    } ],
    [ routeKey('GET', '/repos/owner/repo/actions/workflows/102/runs'), function () {
        return javaScriptObjectNotationResponse({
            workflow_runs: [ { databaseIdentifier: 12, event: 'workflow_dispatch', head_sha: 'release-head' } ]
        });
    } ],
    [ routeKey('GET', '/repos/owner/repo/branches/main'), function () {
        return javaScriptObjectNotationResponse({ commit: { hash: 'main-head' } });
    } ]
]);

const releaseBranchReferencePath = `/repos/owner/repo/git/refs/${encodeURIComponent('heads/release/packtory')}`;

export function createFetch(capturedRequests: CapturedRequests): typeof globalThis.fetch {
    return createRecordedRouteFetch(capturedRequests, defaultRoutes);
}

export function assertBranchWasDeleted(records: readonly RecordedRequest[]): void {
    assert.strictEqual(
        records.some(function (record) {
            return record.method === 'DELETE' && record.path === releaseBranchReferencePath;
        }),
        true
    );
}

export function createDeleteReleaseBranchClient(
    capturedRequests: CapturedRequests,
    response: RouteResponse
): ReleasePullRequestGitHubClient {
    return createClient(createRecordedRouteFetch(
        capturedRequests,
        new Map([ [ routeKey('DELETE', releaseBranchReferencePath), response ] ])
    ));
}

export function countReleasePullRequestLookups(records: readonly RecordedRequest[]): number {
    return records
        .filter(function (record) {
            return (
                record.method === 'GET' &&
                record.path === '/repos/owner/repo/pulls' &&
                requestHasSearchParameter(record, 'head', 'owner:release/packtory') &&
                requestHasSearchParameter(record, 'state', 'open')
            );
        })
        .length;
}

function fetchInputAddress(input: Parameters<typeof globalThis.fetch>[0]): string {
    if (typeof input === 'string') {
        return input;
    }
    if (input instanceof URL) {
        return input.href;
    }
    return input.url;
}

export async function assertBranchHeadUsesApplicationProgrammingInterfaceBaseAddress(
    applicationProgrammingInterfaceBaseAddress: string,
    expectedAddress: string
): Promise<void> {
    const fetchImplementation = fake(async function (input: Parameters<typeof globalThis.fetch>[0]) {
        assert.strictEqual(fetchInputAddress(input), expectedAddress);
        return javaScriptObjectNotationResponse({ commit: { hash: 'main-head' } });
    });
    const client = createReleasePullRequestGitHubClient({
        applicationProgrammingInterfaceBaseAddress,
        fetch: fetchImplementation,
        owner: 'owner',
        repository: 'repo',
        token: 'token'
    });

    assert.strictEqual(await client.getBranchHeadHash('main'), 'main-head');
    assert.strictEqual(fetchImplementation.callCount, 1);
}
