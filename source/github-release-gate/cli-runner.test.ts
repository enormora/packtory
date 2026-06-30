import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Result } from 'true-myth';
import type { ReleaseAnalysisOutcome, ReleaseAnalysisResult } from '../packages/packtory/packtory.entry-point.ts';
import { createFakeFileManager } from '../test-libraries/fake-file-manager.ts';
import {
    ciRunsPath,
    createBaseEnvironment,
    createBaseRoutes,
    createEnvironmentVariableReader,
    pullsPath,
    timelinePath,
    runEntryPointScript,
    type RouteResponse,
    withGitHubApiServer,
    workspaceOutputPath
} from '../test-libraries/github-release-gate-test-support.ts';
import { withDeadline } from '../test-libraries/with-deadline.ts';
import { runGitHubReleaseGate } from './cli-runner.ts';

const entryPointPath = fileURLToPath(
    new URL('../packages/github-release-gate/github-release-gate.entry-point.ts', import.meta.url)
);
const testDeadlineMilliseconds = 2000;

type SuccessfulReleaseAnalysisOverrides = {
    readonly classification: 'dependency-only' | 'first-publish' | 'substantive' | 'unchanged';
};

type ReleaseAnalysisFailureExpectation = {
    readonly apiBaseUrl: string;
    readonly expectedError: RegExp;
    readonly result: ReleaseAnalysisResult;
};

function successfulReleaseAnalysis(
    overrides: Partial<SuccessfulReleaseAnalysisOverrides> = {}
): ReleaseAnalysisOutcome {
    return {
        getReport: fake(),
        result: Result.ok({
            classification: overrides.classification ?? 'substantive',
            mostRecentPublishedAt: new Date('2026-05-01T00:00:00.000Z'),
            packageAnalyses: [
                {
                    classification: overrides.classification ?? 'substantive',
                    latestPublishedAt: new Date('2026-05-01T00:00:00.000Z'),
                    latestPublishedVersion: '1.0.0',
                    name: 'pkg-a'
                }
            ]
        })
    };
}

function minutesBefore(timestamp: number, minutes: number): string {
    const date = new Date(timestamp - minutes * 60 * 1000);
    return date.toISOString();
}

async function expectReleaseAnalysisFailure(spec: ReleaseAnalysisFailureExpectation): Promise<void> {
    await assert.rejects(async function () {
        await runGitHubReleaseGate({
            analyzeReleaseAgainstLatestPublished: fake.resolves({
                getReport: fake(),
                result: spec.result
            }),
            fetch,
            fileManager: createFakeFileManager(),
            getEnvironmentVariable: createEnvironmentVariableReader(
                createBaseEnvironment({
                    GITHUB_API_BASE_URL: spec.apiBaseUrl,
                    QUIET_PERIOD_MINUTES: '0'
                })
            ),
            loadPacktoryConfig: fake.resolves({}),
            now() {
                return new Date('2026-05-20T12:00:00.000Z');
            },
            stdoutWrite() {
                return undefined;
            }
        });
    }, spec.expectedError);
}

suite('github-release-gate-cli-runner', function () {
    test('runGitHubReleaseGate writes a closed-gate result when recent PR activity is inside the quiet period', async function () {
        await withDeadline(
            withGitHubApiServer(createBaseRoutes(), async function (apiBaseUrl) {
                const fileManager = createFakeFileManager();
                const logs: string[] = [];
                const analyzeReleaseAgainstLatestPublished = fake.resolves(successfulReleaseAnalysis());
                const loadPacktoryConfig = fake.resolves({});

                await runGitHubReleaseGate({
                    analyzeReleaseAgainstLatestPublished,
                    fetch,
                    fileManager,
                    getEnvironmentVariable: createEnvironmentVariableReader(
                        createBaseEnvironment({
                            GITHUB_API_BASE_URL: apiBaseUrl
                        })
                    ),
                    loadPacktoryConfig,
                    now() {
                        return new Date('2026-05-19T11:00:00.000Z');
                    },
                    stdoutWrite(message) {
                        logs.push(message);
                    }
                });

                assert.ok(logs.includes('Skipping publish: repository activity is not stale enough yet.'));
                assert.deepStrictEqual(fileManager.getWriteFileCall(0), {
                    filePath: workspaceOutputPath,
                    content: 'main_head_sha=abc123\nshould_publish=false\nreason=activity_not_stale\n'
                });
                assert.strictEqual(loadPacktoryConfig.callCount, 0);
                assert.strictEqual(analyzeReleaseAgainstLatestPublished.callCount, 0);
            }),
            'withGitHubApiServer',
            testDeadlineMilliseconds
        );
    });

    test('runGitHubReleaseGate writes an open-gate result when max latency has elapsed and the pending release is substantive', async function () {
        const routes = createBaseRoutes() as Record<string, RouteResponse>;
        routes[pullsPath] = {
            body: [
                {
                    created_at: '2026-05-20T11:55:00.000Z',
                    html_url: 'https://github.com/enormora/packtory/pull/1',
                    number: 1
                }
            ]
        };
        routes[timelinePath] = {
            body: [
                {
                    committer: { date: '2026-05-20T11:58:00.000Z' },
                    created_at: null,
                    event: 'committed'
                }
            ]
        };

        await withDeadline(
            withGitHubApiServer(routes, async function (apiBaseUrl) {
                const fileManager = createFakeFileManager();
                const analyzeReleaseAgainstLatestPublished = fake.resolves(successfulReleaseAnalysis());

                await runGitHubReleaseGate({
                    analyzeReleaseAgainstLatestPublished,
                    fetch,
                    fileManager,
                    getEnvironmentVariable: createEnvironmentVariableReader(
                        createBaseEnvironment({
                            GITHUB_API_BASE_URL: apiBaseUrl
                        })
                    ),
                    loadPacktoryConfig: fake.resolves({}),
                    now() {
                        return new Date('2026-05-20T12:00:00.000Z');
                    },
                    stdoutWrite() {
                        return undefined;
                    }
                });

                assert.deepStrictEqual(fileManager.getWriteFileCall(0), {
                    filePath: workspaceOutputPath,
                    content: 'main_head_sha=abc123\nshould_publish=true\nreason=max_latency_elapsed\n'
                });
                assert.strictEqual(analyzeReleaseAgainstLatestPublished.callCount, 1);
            }),
            'withGitHubApiServer',
            testDeadlineMilliseconds
        );
    });

    test('CLI entry point exits with code 0 and writes the output file on success', async function () {
        const now = Date.now();
        const routes = createBaseRoutes() as Record<string, RouteResponse>;
        routes[ciRunsPath] = {
            body: {
                workflow_runs: [
                    {
                        conclusion: 'success',
                        event: 'push',
                        head_sha: 'abc123',
                        html_url: 'https://github.com/enormora/packtory/actions/runs/1',
                        status: 'completed',
                        updated_at: minutesBefore(now, 10)
                    }
                ]
            }
        };
        routes[pullsPath] = {
            body: [
                {
                    created_at: minutesBefore(now, 8),
                    html_url: 'https://github.com/enormora/packtory/pull/1',
                    number: 1
                }
            ]
        };
        routes[timelinePath] = {
            body: [
                {
                    committer: { date: minutesBefore(now, 5) },
                    created_at: null,
                    event: 'committed'
                }
            ]
        };

        await withDeadline(
            withGitHubApiServer(routes, async function (apiBaseUrl) {
                const result = await withDeadline(
                    runEntryPointScript(
                        entryPointPath,
                        createBaseEnvironment({
                            GITHUB_API_BASE_URL: apiBaseUrl
                        })
                    ),
                    'runEntryPointScript',
                    testDeadlineMilliseconds
                );

                assert.strictEqual(result.exitCode, 0);
                assert.match(result.output, /should_publish=false/u);
                assert.match(result.output, /reason=activity_not_stale/u);
            }),
            'withGitHubApiServer',
            testDeadlineMilliseconds
        );
    });

    test('CLI entry point exits with code 1 on configuration errors', async function () {
        const result = await withDeadline(
            runEntryPointScript(entryPointPath, {
                GITHUB_REPOSITORY: 'enormora/packtory'
            }),
            'runEntryPointScript',
            testDeadlineMilliseconds
        );

        assert.strictEqual(result.exitCode, 1);
        assert.match(result.output, /Missing GITHUB_TOKEN environment variable/u);
    });

    test('runGitHubReleaseGate surfaces partial release-analysis failures as joined error messages', async function () {
        await withDeadline(
            withGitHubApiServer(createBaseRoutes(), async function (apiBaseUrl) {
                await expectReleaseAnalysisFailure({
                    apiBaseUrl,
                    expectedError: /boom-a\nboom-b/u,
                    result: Result.err({
                        type: 'partial' as const,
                        succeeded: [],
                        failures: [ new Error('boom-a'), new Error('boom-b') ]
                    })
                });
            }),
            'withGitHubApiServer',
            testDeadlineMilliseconds
        );
    });

    test('runGitHubReleaseGate surfaces config release-analysis failures as joined issues', async function () {
        await withDeadline(
            withGitHubApiServer(createBaseRoutes(), async function (apiBaseUrl) {
                await expectReleaseAnalysisFailure({
                    apiBaseUrl,
                    expectedError: /issue-a\nissue-b/u,
                    result: Result.err({
                        type: 'config' as const,
                        issues: [ 'issue-a', 'issue-b' ]
                    })
                });
            }),
            'withGitHubApiServer',
            testDeadlineMilliseconds
        );
    });
});
