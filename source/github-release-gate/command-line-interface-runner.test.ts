import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Result } from 'true-myth';
import type { ReleaseAnalysisOutcome, ReleaseAnalysisResult } from '../packages/packtory/packtory.entry-point.ts';
import { createFakeFileManager } from '../test-libraries/fake-file-manager.ts';
import {
    createBaseEnvironment,
    createBaseRoutes,
    createEnvironmentVariableReader,
    pullsPath,
    timelinePath,
    workspaceOutputPath,
    type RouteResponse
} from '../test-libraries/github-release-gate-test-support.ts';
import { withGitHubTransport } from '../test-libraries/github-release-gate-transport.ts';
import { runGitHubReleaseGate } from './command-line-interface-runner.ts';

type ReleaseAnalysisFailureExpectation = {
    readonly applicationProgrammingInterfaceBaseAddress: string;
    readonly expectedError: RegExp;
    readonly result: ReleaseAnalysisResult;
    readonly fetch: typeof globalThis.fetch;
};
function substantiveReleaseAnalysis(): ReleaseAnalysisOutcome {
    return {
        getReport: fake(),
        result: Result.ok({
            classification: 'substantive',
            mostRecentPublishedAt: new Date('2026-05-01T00:00:00.000Z'),
            packageAnalyses: [ {
                classification: 'substantive',
                latestPublishedAt: new Date('2026-05-01T00:00:00.000Z'),
                latestPublishedVersion: '1.0.0',
                name: 'package-a'
            } ]
        })
    };
}
async function expectReleaseAnalysisFailure(input: ReleaseAnalysisFailureExpectation): Promise<void> {
    await assert.rejects(async function () {
        await runGitHubReleaseGate({
            analyzeReleaseAgainstLatestPublished: fake.resolves({
                getReport: fake(),
                result: input.result
            }),
            fetch: input.fetch,
            fileManager: createFakeFileManager(),
            getEnvironmentVariable: createEnvironmentVariableReader(createBaseEnvironment({
                GITHUB_API_BASE_URL: input.applicationProgrammingInterfaceBaseAddress,
                QUIET_PERIOD_MINUTES: '0'
            })),
            loadPacktoryConfiguration: fake.resolves({}),
            now() {
                return new Date('2026-05-20T12:00:00.000Z');
            },
            standardOutputWrite() {
                return undefined;
            }
        });
    }, input.expectedError);
}

suite('github-release-gate-cli-runner', function () {
    test('rejects a checkout that differs from the main commit checked by the gate', async function () {
        await withGitHubTransport(
            createBaseRoutes(),
            async function (applicationProgrammingInterfaceBaseAddress, request) {
                const fileManager = createFakeFileManager();
                const loadPacktoryConfiguration = fake.resolves({});
                const analyzeReleaseAgainstLatestPublished = fake.resolves(substantiveReleaseAnalysis());
                const releaseGateRun = runGitHubReleaseGate({
                    analyzeReleaseAgainstLatestPublished,
                    fetch: request,
                    fileManager,
                    getEnvironmentVariable: createEnvironmentVariableReader(createBaseEnvironment({
                        GITHUB_API_BASE_URL: applicationProgrammingInterfaceBaseAddress,
                        CHECKED_OUT_HEAD_HASH: 'different-head',
                        QUIET_PERIOD_MINUTES: '0'
                    })),
                    loadPacktoryConfiguration,
                    now() {
                        return new Date('2026-05-20T12:00:00.000Z');
                    },
                    standardOutputWrite: fake()
                });
                await assert.rejects(
                    releaseGateRun,
                    /^Error: Checked-out commit different-head differs from main HEAD abc123; retry from main$/u
                );
                assert.strictEqual(loadPacktoryConfiguration.callCount, 0);
                assert.strictEqual(analyzeReleaseAgainstLatestPublished.callCount, 0);
                assert.strictEqual(fileManager.getWriteFileCallCount(), 0);
            }
        );
    });

    test('runGitHubReleaseGate writes a closed-gate result when recent PR activity is inside the quiet period', async function () {
        await withGitHubTransport(
            createBaseRoutes(),
            async function (applicationProgrammingInterfaceBaseAddress, request) {
                const fileManager = createFakeFileManager();
                const logs: string[] = [];
                const analyzeReleaseAgainstLatestPublished = fake.resolves(substantiveReleaseAnalysis());
                const loadPacktoryConfiguration = fake.resolves({});
                await runGitHubReleaseGate({
                    analyzeReleaseAgainstLatestPublished,
                    fetch: request,
                    fileManager,
                    getEnvironmentVariable: createEnvironmentVariableReader(createBaseEnvironment({
                        GITHUB_API_BASE_URL: applicationProgrammingInterfaceBaseAddress,
                        CHECKED_OUT_HEAD_HASH: 'abc123'
                    })),
                    loadPacktoryConfiguration,
                    now() {
                        return new Date('2026-05-19T11:00:00.000Z');
                    },
                    standardOutputWrite(message) {
                        logs.push(message);
                    }
                });
                assert.ok(logs.includes('Skipping publish: repository activity is not stale enough yet.'));
                assert.deepStrictEqual(fileManager.getWriteFileCall(0), {
                    filePath: workspaceOutputPath,
                    content: 'main_head_sha=abc123\nshould_publish=false\nreason=activity_not_stale\n'
                });
                assert.strictEqual(loadPacktoryConfiguration.callCount, 0);
                assert.strictEqual(analyzeReleaseAgainstLatestPublished.callCount, 0);
            }
        );
    });

    test('runGitHubReleaseGate writes an open-gate result when max latency has elapsed and the pending release is substantive', async function () {
        const routes = createBaseRoutes() as Record<string, RouteResponse>;
        routes[pullsPath] = {
            body: [ {
                created_at: '2026-05-20T11:55:00.000Z',
                html_url: 'https://github.com/enormora/packtory/pull/1',
                number: 1
            } ]
        };
        routes[timelinePath] = {
            body: [ {
                committer: {
                    date: '2026-05-20T11:58:00.000Z'
                },
                created_at: null,
                event: 'committed'
            } ]
        };
        await withGitHubTransport(routes, async function (applicationProgrammingInterfaceBaseAddress, request) {
            const fileManager = createFakeFileManager();
            const analyzeReleaseAgainstLatestPublished = fake.resolves(substantiveReleaseAnalysis());
            await runGitHubReleaseGate({
                analyzeReleaseAgainstLatestPublished,
                fetch: request,
                fileManager,
                getEnvironmentVariable: createEnvironmentVariableReader(createBaseEnvironment({
                    GITHUB_API_BASE_URL: applicationProgrammingInterfaceBaseAddress
                })),
                loadPacktoryConfiguration: fake.resolves({}),
                now() {
                    return new Date('2026-05-20T12:00:00.000Z');
                },
                standardOutputWrite() {
                    return undefined;
                }
            });
            assert.deepStrictEqual(fileManager.getWriteFileCall(0), {
                filePath: workspaceOutputPath,
                content: 'main_head_sha=abc123\nshould_publish=true\nreason=max_latency_elapsed\n'
            });
            assert.strictEqual(analyzeReleaseAgainstLatestPublished.callCount, 1);
        });
    });

    test('runGitHubReleaseGate surfaces partial release-analysis failures as joined error messages', async function () {
        await withGitHubTransport(
            createBaseRoutes(),
            async function (applicationProgrammingInterfaceBaseAddress, request) {
                await expectReleaseAnalysisFailure({
                    applicationProgrammingInterfaceBaseAddress,
                    expectedError: /boom-a\nboom-b/u,
                    result: Result.err({
                        skipped: [],
                        type: 'partial' as const,
                        succeeded: [],
                        failures: [ new Error('boom-a'), new Error('boom-b') ]
                    }),
                    fetch: request
                });
            }
        );
    });

    test('runGitHubReleaseGate surfaces config release-analysis failures as joined issues', async function () {
        await withGitHubTransport(
            createBaseRoutes(),
            async function (applicationProgrammingInterfaceBaseAddress, request) {
                await expectReleaseAnalysisFailure({
                    applicationProgrammingInterfaceBaseAddress,
                    expectedError: /issue-a\nissue-b/u,
                    result: Result.err({
                        type: 'configuration' as const,
                        issues: [ 'issue-a', 'issue-b' ]
                    }),
                    fetch: request
                });
            }
        );
    });
});
