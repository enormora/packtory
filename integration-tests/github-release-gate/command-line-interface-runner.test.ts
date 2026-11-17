import assert from 'node:assert';
import { fileURLToPath as fileAddressToPath } from 'node:url';
import { suite, test } from 'mocha';

import {
    continuousIntegrationRunsPath,
    createBaseEnvironment,
    createBaseRoutes,
    pullsPath,
    runEntryPointScript,
    timelinePath,
    withGitHubApplicationProgrammingInterfaceServer,
    type RouteResponse
} from '../../source/test-libraries/github-release-gate-test-support.ts';
import { withDeadline } from '../../source/test-libraries/with-deadline.ts';

const entryPointPath = fileAddressToPath(
    new URL('../../source/packages/github-release-gate/github-release-gate.entry-point.ts', import.meta.url)
);

const entryPointScriptDeadlineMilliseconds = 10_000;
const entryPointServerDeadlineMilliseconds = 12_000;

function minutesBefore(timestamp: number, minutes: number): string {
    const date = new Date(timestamp - minutes * 60 * 1000);
    return date.toISOString();
}

suite('github-release-gate-cli-runner', function () {
    test('CLI entry point exits with code 0 and writes the output file on success', async function () {
        const now = Date.now();
        const routes = createBaseRoutes() as Record<string, RouteResponse>;
        routes[continuousIntegrationRunsPath] = {
            body: {
                workflow_runs: [ {
                    conclusion: 'success',
                    event: 'push',
                    head_sha: 'abc123',
                    html_url: 'https://github.com/enormora/packtory/actions/runs/1',
                    status: 'completed',
                    updated_at: minutesBefore(now, 10)
                } ]
            }
        };
        routes[pullsPath] = {
            body: [ {
                created_at: minutesBefore(now, 8),
                html_url: 'https://github.com/enormora/packtory/pull/1',
                number: 1
            } ]
        };
        routes[timelinePath] = {
            body: [ {
                committer: {
                    date: minutesBefore(now, 5)
                },
                created_at: null,
                event: 'committed'
            } ]
        };
        await withDeadline(
            withGitHubApplicationProgrammingInterfaceServer(
                routes,
                async function (applicationProgrammingInterfaceBaseAddress) {
                    const result = await withDeadline(
                        runEntryPointScript(
                            entryPointPath,
                            createBaseEnvironment({
                                GITHUB_API_BASE_URL: applicationProgrammingInterfaceBaseAddress
                            })
                        ),
                        'runEntryPointScript',
                        entryPointScriptDeadlineMilliseconds
                    );
                    assert.strictEqual(result.exitCode, 0);
                    assert.match(result.output, /should_publish=false/u);
                    assert.match(result.output, /reason=activity_not_stale/u);
                }
            ),
            'withGitHubApplicationProgrammingInterfaceServer',
            entryPointServerDeadlineMilliseconds
        );
    });

    test('CLI entry point exits with code 1 on configuration errors', async function () {
        const result = await withDeadline(
            runEntryPointScript(entryPointPath, {
                GITHUB_REPOSITORY: 'enormora/packtory'
            }),
            'runEntryPointScript',
            entryPointScriptDeadlineMilliseconds
        );
        assert.strictEqual(result.exitCode, 1);
        assert.match(result.output, /Missing GITHUB_TOKEN environment variable/u);
    });
});
