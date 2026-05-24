import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    ciRunsPath,
    createBaseRoutes,
    pullsPath,
    timelinePath,
    type RouteResponse
} from '../test-libraries/github-release-gate-test-support.ts';
import { createGitHubReleaseGateApi } from './github-api.ts';
import type { GitHubRepositoryContext } from './runner-config.ts';

type MockRoute = RouteResponse & {
    readonly statusText?: string;
};

type RecordedRequest = {
    readonly headers: Readonly<Record<string, string | undefined>>;
    readonly url: string;
};

const defaultContext: GitHubRepositoryContext = {
    apiBaseUrl: 'https://api.github.com',
    defaultBranch: 'main',
    owner: 'enormora',
    repo: 'packtory',
    token: 'token'
};

function getRequestUrl(input: RequestInfo | URL): string {
    if (input instanceof URL) {
        return input.href;
    }

    if (typeof input === 'string') {
        return input;
    }

    return input.url;
}

type MockRouteMap = Readonly<Record<string, MockRoute>>;

function createJsonFetch(routes: MockRouteMap, requests: RecordedRequest[] = []): typeof globalThis.fetch {
    return async (input, init) => {
        const url = new URL(getRequestUrl(input));
        const headers = new Headers(init?.headers);
        const route = routes[`${url.pathname}${url.search}`];

        requests.push({
            headers: {
                accept: headers.get('Accept') ?? undefined,
                authorization: headers.get('Authorization') ?? undefined,
                'user-agent': headers.get('User-Agent') ?? undefined,
                'x-github-api-version': headers.get('X-GitHub-Api-Version') ?? undefined
            },
            url: `${url.pathname}${url.search}`
        });

        if (route === undefined) {
            throw new Error(`Unexpected fetch URL: ${url}`);
        }

        return Response.json(route.body, {
            status: route.status ?? 200,
            ...(route.headers === undefined ? {} : { headers: route.headers }),
            ...(route.statusText === undefined ? {} : { statusText: route.statusText })
        });
    };
}

suite('github-release-gate-github-api', function () {
    test('getMainBranchHeadSha sends the required GitHub headers', async function () {
        const requests: RecordedRequest[] = [];
        const api = createGitHubReleaseGateApi(createJsonFetch(createBaseRoutes(), requests), defaultContext);

        assert.strictEqual(await api.getMainBranchHeadSha(), 'abc123');
        assert.deepStrictEqual(requests[0], {
            headers: {
                accept: 'application/vnd.github+json',
                authorization: 'Bearer token',
                'user-agent': 'packtory-github-release-gate',
                'x-github-api-version': '2022-11-28'
            },
            url: '/repos/enormora/packtory/branches/main'
        });
    });

    test('getLatestSuccessfulMainCiRun ignores mismatched workflow runs', async function () {
        const routes = createBaseRoutes() as Record<string, MockRoute>;
        routes[ciRunsPath] = {
            body: {
                workflow_runs: [
                    {
                        conclusion: 'success',
                        event: 'push',
                        head_sha: 'different-sha',
                        html_url: 'https://github.com/enormora/packtory/actions/runs/1',
                        updated_at: '2026-05-19T10:00:00.000Z'
                    },
                    {
                        conclusion: 'success',
                        event: 'merge_group',
                        head_sha: 'abc123',
                        html_url: 'https://github.com/enormora/packtory/actions/runs/2',
                        updated_at: '2026-05-19T10:05:00.000Z'
                    }
                ]
            }
        };
        const api = createGitHubReleaseGateApi(createJsonFetch(routes), defaultContext);

        assert.strictEqual(await api.getLatestSuccessfulMainCiRun('ci.yml', 'abc123'), undefined);
    });

    test('getLatestSuccessfulMainCiRun ignores failed runs even when the head SHA and event match', async function () {
        const routes = createBaseRoutes() as Record<string, MockRoute>;
        routes[ciRunsPath] = {
            body: {
                workflow_runs: [
                    {
                        conclusion: 'failure',
                        event: 'push',
                        head_sha: 'abc123',
                        html_url: 'https://github.com/enormora/packtory/actions/runs/1',
                        updated_at: '2026-05-19T10:00:00.000Z'
                    }
                ]
            }
        };
        const api = createGitHubReleaseGateApi(createJsonFetch(routes), defaultContext);

        assert.strictEqual(await api.getLatestSuccessfulMainCiRun('ci.yml', 'abc123'), undefined);
    });

    test('getOpenPullRequestActivities follows paginated responses', async function () {
        const routes = createBaseRoutes() as Record<string, MockRoute>;
        routes[pullsPath] = {
            body: [
                {
                    created_at: '2026-05-19T10:15:00.000Z',
                    html_url: 'https://github.com/enormora/packtory/pull/1',
                    number: 1
                }
            ],
            headers: {
                link:
                    '<https://api.github.com/repos/enormora/packtory/pulls?page=1>; rel="prev",' +
                    ' <https://api.github.com/repos/enormora/packtory/pulls?page=2>; rel="next"'
            }
        };
        routes['/repos/enormora/packtory/pulls?page=2'] = {
            body: [
                {
                    created_at: '2026-05-19T10:20:00.000Z',
                    html_url: 'https://github.com/enormora/packtory/pull/2',
                    number: 2
                }
            ]
        };
        routes['/repos/enormora/packtory/issues/2/timeline?per_page=100'] = {
            body: [
                {
                    committer: { date: '2026-05-19T10:25:00.000Z' },
                    created_at: null,
                    event: 'committed'
                }
            ]
        };
        const api = createGitHubReleaseGateApi(createJsonFetch(routes), defaultContext);

        assert.deepStrictEqual(await api.getOpenPullRequestActivities(), [
            {
                activityAt: new Date('2026-05-19T10:30:00.000Z'),
                htmlUrl: 'https://github.com/enormora/packtory/pull/1',
                number: 1
            },
            {
                activityAt: new Date('2026-05-19T10:25:00.000Z'),
                htmlUrl: 'https://github.com/enormora/packtory/pull/2',
                number: 2
            }
        ]);
    });

    test('getOpenPullRequestActivities ignores malformed or non-next pagination links', async function () {
        for (const linkHeader of [
            '<>; rel="next"',
            '<https://api.github.com/repos/enormora/packtory/pulls?page=2>; rel="prev"'
        ]) {
            const routes = createBaseRoutes() as Record<string, MockRoute>;
            routes[pullsPath] = {
                body: [
                    {
                        created_at: '2026-05-19T10:15:00.000Z',
                        html_url: 'https://github.com/enormora/packtory/pull/1',
                        number: 1
                    }
                ],
                headers: {
                    link: linkHeader
                }
            };
            const api = createGitHubReleaseGateApi(createJsonFetch(routes), defaultContext);

            assert.deepStrictEqual(await api.getOpenPullRequestActivities(), [
                {
                    activityAt: new Date('2026-05-19T10:30:00.000Z'),
                    htmlUrl: 'https://github.com/enormora/packtory/pull/1',
                    number: 1
                }
            ]);
        }
    });

    test('GitHub API methods propagate request failures', async function () {
        const requests: RecordedRequest[] = [];
        const routes = createBaseRoutes() as Record<string, MockRoute>;
        routes['/repos/enormora/packtory/branches/main'] = {
            body: { message: 'boom' },
            status: 500,
            statusText: 'Internal Server Error'
        };
        const api = createGitHubReleaseGateApi(createJsonFetch(routes, requests), defaultContext);

        await assert.rejects(async () => {
            await api.getMainBranchHeadSha();
        }, /GitHub API request failed/u);
        assert.strictEqual(requests.length, 1);
    });

    test('GitHub API methods preserve branch response parse failures', async function () {
        const routes = createBaseRoutes() as Record<string, MockRoute>;
        routes['/repos/enormora/packtory/branches/main'] = {
            body: { nope: true }
        };
        const api = createGitHubReleaseGateApi(createJsonFetch(routes), defaultContext);

        await assert.rejects(async () => {
            await api.getMainBranchHeadSha();
        });
    });

    test('getOpenPullRequestActivities preserves pull list parse failures', async function () {
        const routes = createBaseRoutes() as Record<string, MockRoute>;
        routes[pullsPath] = {
            body: { nope: true }
        };
        const api = createGitHubReleaseGateApi(createJsonFetch(routes), defaultContext);

        await assert.rejects(async () => {
            await api.getOpenPullRequestActivities();
        });
    });

    test('getOpenPullRequestActivities formats GitHub pagination failures with the failing request path', async function () {
        const api = createGitHubReleaseGateApi(async () => {
            throw Object.assign(new Error('boom'), {
                request: {
                    url: 'https://api.github.com/repos/enormora/packtory/pulls?state=open&base=main&per_page=100'
                },
                status: 500
            });
        }, defaultContext);

        await assert.rejects(async () => {
            await api.getOpenPullRequestActivities();
        }, /GitHub API request failed \(500\) for \/repos\/enormora\/packtory\/pulls\?state=open&base=main&per_page=100/u);
    });

    test('GitHub API methods reject invalid timestamps', async function () {
        const routes = createBaseRoutes() as Record<string, MockRoute>;
        routes[timelinePath] = {
            body: [
                {
                    committer: { date: 'not-a-timestamp' },
                    created_at: null,
                    event: 'committed'
                }
            ]
        };
        const api = createGitHubReleaseGateApi(createJsonFetch(routes), defaultContext);

        await assert.rejects(async () => {
            await api.getOpenPullRequestActivities();
        }, /Invalid timestamp/u);
    });

    test('getOpenPullRequestActivities uses created_at for non-committed branch-activity events', async function () {
        const routes = createBaseRoutes() as Record<string, MockRoute>;
        routes[timelinePath] = {
            body: [
                {
                    created_at: '2026-05-19T11:00:00.000Z',
                    event: 'head_ref_force_pushed'
                }
            ]
        };
        const api = createGitHubReleaseGateApi(createJsonFetch(routes), defaultContext);

        assert.deepStrictEqual(await api.getOpenPullRequestActivities(), [
            {
                activityAt: new Date('2026-05-19T11:00:00.000Z'),
                htmlUrl: 'https://github.com/enormora/packtory/pull/1',
                number: 1
            }
        ]);
    });

    test('getOpenPullRequestActivities skips committed events without a committer date', async function () {
        const routes = createBaseRoutes() as Record<string, MockRoute>;
        routes[timelinePath] = {
            body: [
                {
                    created_at: null,
                    event: 'committed'
                }
            ]
        };
        const api = createGitHubReleaseGateApi(createJsonFetch(routes), defaultContext);

        assert.deepStrictEqual(await api.getOpenPullRequestActivities(), [
            {
                activityAt: new Date('2026-05-19T10:15:00.000Z'),
                htmlUrl: 'https://github.com/enormora/packtory/pull/1',
                number: 1
            }
        ]);
    });

    test('getOpenPullRequestActivities skips timeline events without a timestamp', async function () {
        const routes = createBaseRoutes() as Record<string, MockRoute>;
        routes[timelinePath] = {
            body: [
                { event: 'reviewed', submitted_at: '2026-05-19T10:40:00.000Z' },
                {
                    committer: { date: '2026-05-19T10:45:00.000Z' },
                    created_at: null,
                    event: 'committed'
                }
            ]
        };
        const api = createGitHubReleaseGateApi(createJsonFetch(routes), defaultContext);

        assert.deepStrictEqual(await api.getOpenPullRequestActivities(), [
            {
                activityAt: new Date('2026-05-19T10:45:00.000Z'),
                htmlUrl: 'https://github.com/enormora/packtory/pull/1',
                number: 1
            }
        ]);
    });
});
