import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    createBaseRoutes,
    pullsPath,
    timelinePath
} from '../test-libraries/github-release-gate-test-support.ts';
import {
    createJavaScriptObjectNotationFetch,
    defaultContext,
    getOpenPullRequestActivitiesForTimeline,
    runGetMainContinuousIntegrationRunStatus,
    withContinuousIntegrationWorkflowRuns,
    type MockRoute,
    type RecordedRequest
} from '../test-libraries/release-gate-request-fixtures.ts';
import {
    createGitHubReleaseGateApplicationProgrammingInterface
} from './github-application-programming-interface.ts';

suite('github-release-gate-github-api', function () {
    suite('main branch and ci', function () {
        test('getMainBranchHeadHash sends the required GitHub headers', async function () {
            const requests: RecordedRequest[] = [];
            const applicationProgrammingInterface = createGitHubReleaseGateApplicationProgrammingInterface(
                createJavaScriptObjectNotationFetch(createBaseRoutes(), requests),
                defaultContext
            );

            assert.strictEqual(await applicationProgrammingInterface.getMainBranchHeadHash(), 'abc123');
            assert.deepStrictEqual(requests[0], {
                headers: {
                    accept: 'application/vnd.github+json',
                    authorization: 'Bearer token',
                    'user-agent': 'packtory-github-release-gate',
                    'x-github-api-version': '2022-11-28'
                },
                address: '/repos/enormora/packtory/branches/main'
            });
        });

        test('getMainContinuousIntegrationRunStatus returns success for a completed successful push run', async function () {
            assert.deepStrictEqual(await runGetMainContinuousIntegrationRunStatus(createBaseRoutes()), {
                kind: 'success',
                run: {
                    hypertextMarkupLanguageAddress: 'https://github.com/enormora/packtory/actions/runs/1',
                    updatedAt: new Date('2026-05-19T10:00:00.000Z')
                }
            });
        });

        test('getMainContinuousIntegrationRunStatus reports missing when only mismatched workflow runs exist', async function () {
            const routes = withContinuousIntegrationWorkflowRuns([
                {
                    conclusion: 'success',
                    event: 'push',
                    head_sha: 'different-sha',
                    html_url: 'https://github.com/enormora/packtory/actions/runs/1',
                    status: 'completed',
                    updated_at: '2026-05-19T10:00:00.000Z'
                },
                {
                    conclusion: 'success',
                    event: 'merge_group',
                    head_sha: 'abc123',
                    html_url: 'https://github.com/enormora/packtory/actions/runs/2',
                    status: 'completed',
                    updated_at: '2026-05-19T10:05:00.000Z'
                }
            ]);

            assert.deepStrictEqual(await runGetMainContinuousIntegrationRunStatus(routes), { kind: 'missing' });
        });

        test('getMainContinuousIntegrationRunStatus reports missing when the only matching run failed', async function () {
            const routes = withContinuousIntegrationWorkflowRuns([
                {
                    conclusion: 'failure',
                    event: 'push',
                    head_sha: 'abc123',
                    html_url: 'https://github.com/enormora/packtory/actions/runs/1',
                    status: 'completed',
                    updated_at: '2026-05-19T10:00:00.000Z'
                }
            ]);

            assert.deepStrictEqual(await runGetMainContinuousIntegrationRunStatus(routes), { kind: 'missing' });
        });

        test('getMainContinuousIntegrationRunStatus reports in_progress when a matching run is still running', async function () {
            const routes = withContinuousIntegrationWorkflowRuns([
                {
                    conclusion: null,
                    event: 'push',
                    head_sha: 'abc123',
                    html_url: 'https://github.com/enormora/packtory/actions/runs/1',
                    status: 'in_progress',
                    updated_at: '2026-05-19T10:00:00.000Z'
                }
            ]);

            assert.deepStrictEqual(await runGetMainContinuousIntegrationRunStatus(routes), { kind: 'in_progress' });
        });

        test('getMainContinuousIntegrationRunStatus prefers a successful run over a parallel in-progress one', async function () {
            const routes = withContinuousIntegrationWorkflowRuns([
                {
                    conclusion: null,
                    event: 'push',
                    head_sha: 'abc123',
                    html_url: 'https://github.com/enormora/packtory/actions/runs/2',
                    status: 'in_progress',
                    updated_at: '2026-05-19T10:10:00.000Z'
                },
                {
                    conclusion: 'success',
                    event: 'push',
                    head_sha: 'abc123',
                    html_url: 'https://github.com/enormora/packtory/actions/runs/1',
                    status: 'completed',
                    updated_at: '2026-05-19T10:00:00.000Z'
                }
            ]);

            assert.deepStrictEqual(await runGetMainContinuousIntegrationRunStatus(routes), {
                kind: 'success',
                run: {
                    hypertextMarkupLanguageAddress: 'https://github.com/enormora/packtory/actions/runs/1',
                    updatedAt: new Date('2026-05-19T10:00:00.000Z')
                }
            });
        });
    });

    suite('pull request activity', function () {
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
                    link: '<https://api.github.com/repos/enormora/packtory/pulls?page=1>; rel="prev",' +
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
            const applicationProgrammingInterface = createGitHubReleaseGateApplicationProgrammingInterface(
                createJavaScriptObjectNotationFetch(routes),
                defaultContext
            );

            assert.deepStrictEqual(await applicationProgrammingInterface.getOpenPullRequestActivities(), [
                {
                    activityAt: new Date('2026-05-19T10:30:00.000Z'),
                    hypertextMarkupLanguageAddress: 'https://github.com/enormora/packtory/pull/1',
                    number: 1
                },
                {
                    activityAt: new Date('2026-05-19T10:25:00.000Z'),
                    hypertextMarkupLanguageAddress: 'https://github.com/enormora/packtory/pull/2',
                    number: 2
                }
            ]);
        });

        test('getOpenPullRequestActivities ignores malformed or non-next pagination links', async function () {
            for (
                const linkHeader of [
                    '<>; rel="next"',
                    '<https://api.github.com/repos/enormora/packtory/pulls?page=2>; rel="prev"'
                ]
            ) {
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
                const applicationProgrammingInterface = createGitHubReleaseGateApplicationProgrammingInterface(
                    createJavaScriptObjectNotationFetch(routes),
                    defaultContext
                );

                assert.deepStrictEqual(await applicationProgrammingInterface.getOpenPullRequestActivities(), [
                    {
                        activityAt: new Date('2026-05-19T10:30:00.000Z'),
                        hypertextMarkupLanguageAddress: 'https://github.com/enormora/packtory/pull/1',
                        number: 1
                    }
                ]);
            }
        });
    });

    suite('failure handling', function () {
        test('GitHub API methods propagate request failures', async function () {
            const requests: RecordedRequest[] = [];
            const routes = createBaseRoutes() as Record<string, MockRoute>;
            routes['/repos/enormora/packtory/branches/main'] = {
                body: { message: 'boom' },
                status: 500,
                statusText: 'Internal Server Error'
            };
            const applicationProgrammingInterface = createGitHubReleaseGateApplicationProgrammingInterface(
                createJavaScriptObjectNotationFetch(routes, requests),
                defaultContext
            );

            await assert.rejects(async function () {
                await applicationProgrammingInterface.getMainBranchHeadHash();
            }, /GitHub API request failed/u);
            assert.strictEqual(requests.length, 1);
        });

        test('GitHub API methods preserve branch response parse failures', async function () {
            const routes = createBaseRoutes() as Record<string, MockRoute>;
            routes['/repos/enormora/packtory/branches/main'] = {
                body: { nope: true }
            };
            const applicationProgrammingInterface = createGitHubReleaseGateApplicationProgrammingInterface(
                createJavaScriptObjectNotationFetch(routes),
                defaultContext
            );

            await assert.rejects(
                async function () {
                    await applicationProgrammingInterface.getMainBranchHeadHash();
                },
                /Cannot read properties/u
            );
        });

        test('getOpenPullRequestActivities preserves pull list parse failures', async function () {
            const routes = createBaseRoutes() as Record<string, MockRoute>;
            routes[pullsPath] = {
                body: { nope: true }
            };
            const applicationProgrammingInterface = createGitHubReleaseGateApplicationProgrammingInterface(
                createJavaScriptObjectNotationFetch(routes),
                defaultContext
            );

            await assert.rejects(
                async function () {
                    await applicationProgrammingInterface.getOpenPullRequestActivities();
                },
                /issues\/\/timeline/u
            );
        });

        test('getOpenPullRequestActivities formats GitHub pagination failures with the failing request path', async function () {
            const applicationProgrammingInterface = createGitHubReleaseGateApplicationProgrammingInterface(
                async function () {
                    throw Object.assign(new Error('boom'), {
                        request: {
                            url: 'https://api.github.com/repos/enormora/packtory/pulls?state=open&base=main&per_page=100'
                        },
                        status: 500
                    });
                },
                defaultContext
            );

            await assert.rejects(
                async function () {
                    await applicationProgrammingInterface.getOpenPullRequestActivities();
                },
                /GitHub API request failed \(500\) for \/repos\/enormora\/packtory\/pulls\?state=open&base=main&per_page=100/u
            );
        });

        test('GitHub API request formatting preserves the original failure as the cause', async function () {
            const original = Object.assign(new Error('boom'), {
                request: {
                    url: 'https://api.github.com/repos/enormora/packtory/pulls?state=open&base=main&per_page=100'
                },
                status: 500
            });
            const applicationProgrammingInterface = createGitHubReleaseGateApplicationProgrammingInterface(
                async function () {
                    throw original;
                },
                defaultContext
            );

            try {
                await applicationProgrammingInterface.getOpenPullRequestActivities();
                assert.fail('Expected getOpenPullRequestActivities() to reject');
            } catch (error: unknown) {
                assert.ok(error instanceof Error);
                assert.ok(error.cause instanceof Error);
                assert.strictEqual((error.cause as { readonly status?: unknown; }).status, 500);
                assert.strictEqual(
                    (error.cause as { readonly request?: { readonly url?: string; }; }).request?.url,
                    'https://api.github.com/repos/enormora/packtory/pulls?state=open&base=main&per_page=100'
                );
            }
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
            const applicationProgrammingInterface = createGitHubReleaseGateApplicationProgrammingInterface(
                createJavaScriptObjectNotationFetch(routes),
                defaultContext
            );

            await assert.rejects(async function () {
                await applicationProgrammingInterface.getOpenPullRequestActivities();
            }, /Invalid timestamp/u);
        });
    });

    suite('timeline parsing', function () {
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
            const applicationProgrammingInterface = createGitHubReleaseGateApplicationProgrammingInterface(
                createJavaScriptObjectNotationFetch(routes),
                defaultContext
            );

            assert.deepStrictEqual(await applicationProgrammingInterface.getOpenPullRequestActivities(), [
                {
                    activityAt: new Date('2026-05-19T11:00:00.000Z'),
                    hypertextMarkupLanguageAddress: 'https://github.com/enormora/packtory/pull/1',
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
            const applicationProgrammingInterface = createGitHubReleaseGateApplicationProgrammingInterface(
                createJavaScriptObjectNotationFetch(routes),
                defaultContext
            );

            assert.deepStrictEqual(await applicationProgrammingInterface.getOpenPullRequestActivities(), [
                {
                    activityAt: new Date('2026-05-19T10:15:00.000Z'),
                    hypertextMarkupLanguageAddress: 'https://github.com/enormora/packtory/pull/1',
                    number: 1
                }
            ]);
        });

        test('getOpenPullRequestActivities skips timeline events without a timestamp', async function () {
            assert.deepStrictEqual(
                await getOpenPullRequestActivitiesForTimeline([
                    { event: 'reviewed', submitted_at: '2026-05-19T10:40:00.000Z' },
                    {
                        committer: { date: '2026-05-19T10:45:00.000Z' },
                        created_at: null,
                        event: 'committed'
                    }
                ]),
                [
                    {
                        activityAt: new Date('2026-05-19T10:45:00.000Z'),
                        hypertextMarkupLanguageAddress: 'https://github.com/enormora/packtory/pull/1',
                        number: 1
                    }
                ]
            );
        });

        test('getOpenPullRequestActivities skips timeline events without an event name', async function () {
            assert.deepStrictEqual(
                await getOpenPullRequestActivitiesForTimeline([
                    { created_at: '2026-05-19T11:40:00.000Z' },
                    {
                        committer: { date: '2026-05-19T10:45:00.000Z' },
                        created_at: null,
                        event: 'committed'
                    }
                ]),
                [
                    {
                        activityAt: new Date('2026-05-19T10:45:00.000Z'),
                        hypertextMarkupLanguageAddress: 'https://github.com/enormora/packtory/pull/1',
                        number: 1
                    }
                ]
            );
        });
    });
});
