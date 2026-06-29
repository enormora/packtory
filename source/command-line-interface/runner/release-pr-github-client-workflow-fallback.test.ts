import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createReleasePullRequestGitHubClient } from './release-pr-github-client.ts';

type RecordedRequest = {
    readonly path: string;
    readonly search: string;
};
type RequestRecorder = {
    readonly record: (request: RecordedRequest) => void;
};

function jsonResponse(data: unknown): Response {
    return Response.json(data);
}

function routeKey(method: string, path: string): string {
    return `${method} ${path}`;
}

function workflowRoutes(): ReadonlyMap<string, () => Response> {
    return new Map([
        [ routeKey('GET', '/repos/owner/repo/actions/workflows'), function () {
            return jsonResponse({ workflows: [ { id: 101, name: 'ci', path: '.github/workflows/ci.yml' } ] });
        } ],
        [ routeKey('GET', '/repos/owner/repo/actions/workflows/101/runs'), function () {
            return jsonResponse({
                workflow_runs: [ { database_id: 21, event: 'workflow_dispatch', head_sha: 'other-head' } ]
            });
        } ],
        [ routeKey('GET', '/repos/owner/repo/actions/runs'), function () {
            return jsonResponse({
                workflow_runs: [
                    { database_id: 22, event: 'workflow_dispatch', head_sha: 'release-head', workflow_id: 101 },
                    { database_id: 23, event: 'pull_request', head_sha: 'release-head', workflow_id: 101 }
                ]
            });
        } ]
    ]);
}

function requestHasSearchParameter(record: RecordedRequest, name: string, value: string): boolean {
    const searchParameters = new URLSearchParams(record.search);
    return searchParameters.get(name) === value;
}

function createFetch(recorder: RequestRecorder): typeof globalThis.fetch {
    const routes = workflowRoutes();
    return async function (input, init) {
        if (typeof input !== 'string' && !(input instanceof URL)) {
            throw new TypeError('Expected a string or URL fetch input');
        }

        const url = new URL(input);
        const method = init?.method ?? 'GET';
        const response = routes.get(routeKey(method, url.pathname));
        recorder.record({ path: url.pathname, search: url.search });
        return response === undefined ? jsonResponse({ message: `Unhandled ${method} ${url.pathname}` }) : response();
    };
}

suite('release-pr-github-client workflow fallback', function () {
    test('findDispatchedWorkflowRun() finds workflow runs from repository lookup fallback', async function () {
        const records: RecordedRequest[] = [];
        const client = createReleasePullRequestGitHubClient({
            fetch: createFetch({
                record(request) {
                    records.push(request);
                }
            }),
            owner: 'owner',
            repo: 'repo',
            token: 'token'
        });

        assert.deepStrictEqual(
            await client.findDispatchedWorkflowRun({
                branch: 'release/packtory',
                headSha: 'release-head',
                workflowFile: 'ci.yml'
            }),
            { event: 'workflow_dispatch', observedRunIds: [ 21, 22, 23 ], runId: 22 }
        );
        assert.strictEqual(
            records
                .filter(function (record) {
                    return record.path === '/repos/owner/repo/actions/workflows/101/runs' &&
                        requestHasSearchParameter(record, 'event', 'workflow_dispatch');
                })
                .length,
            1
        );
        assert.strictEqual(
            records
                .filter(function (record) {
                    return record.path === '/repos/owner/repo/actions/runs' &&
                        requestHasSearchParameter(record, 'event', 'workflow_dispatch');
                })
                .length,
            1
        );
    });
});
