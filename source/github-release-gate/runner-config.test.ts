import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    createGitHubRepositoryContext,
    readGitHubReleaseGateRunnerConfig,
    type GitHubReleaseGateRunnerConfig
} from './runner-config.ts';

type FakeEnvironment = Readonly<Record<string, string | undefined>>;

function createEnvironmentVariableReader(
    environmentVariables: FakeEnvironment
): (variableName: string) => string | undefined {
    return function (variableName) {
        return environmentVariables[variableName];
    };
}

function createRequiredEnvironment(overrides: FakeEnvironment = {}): FakeEnvironment {
    return {
        GITHUB_OUTPUT: '/workspace/github-output.txt',
        GITHUB_REPOSITORY: 'enormora/packtory',
        GITHUB_TOKEN: 'token',
        ...overrides
    };
}

function readConfig(overrides: FakeEnvironment = {}): Readonly<GitHubReleaseGateRunnerConfig> {
    return readGitHubReleaseGateRunnerConfig(createEnvironmentVariableReader(createRequiredEnvironment(overrides)));
}

suite('github-release-gate-runner-config', function () {
    suite('config reading', function () {
        test('readGitHubReleaseGateRunnerConfig uses defaults for optional environment variables', function () {
            assert.deepStrictEqual(readConfig(), {
                ciWorkflowFile: 'ci.yml',
                dependencyOnlyMinAgeDays: 7,
                defaultBranch: 'main',
                githubApiBaseUrl: 'https://api.github.com',
                githubOutputPath: '/workspace/github-output.txt',
                maxLatencyHours: 24,
                quietPeriodMinutes: 45,
                repository: 'enormora/packtory',
                token: 'token'
            });
        });

        test('readGitHubReleaseGateRunnerConfig honors custom environment values', function () {
            assert.deepStrictEqual(
                readConfig({
                    CI_WORKFLOW_FILE: 'custom ci.yml',
                    DEFAULT_BRANCH: 'release',
                    DEPENDENCY_ONLY_MIN_AGE_DAYS: '9',
                    MAX_LATENCY_HOURS: '1',
                    QUIET_PERIOD_MINUTES: '3'
                }),
                {
                    ciWorkflowFile: 'custom ci.yml',
                    dependencyOnlyMinAgeDays: 9,
                    defaultBranch: 'release',
                    githubApiBaseUrl: 'https://api.github.com',
                    githubOutputPath: '/workspace/github-output.txt',
                    maxLatencyHours: 1,
                    quietPeriodMinutes: 3,
                    repository: 'enormora/packtory',
                    token: 'token'
                }
            );
        });

        test('readGitHubReleaseGateRunnerConfig accepts a loopback GITHUB_API_BASE_URL for testing', function () {
            assert.strictEqual(
                readConfig({ GITHUB_API_BASE_URL: 'http://127.0.0.1:1234' }).githubApiBaseUrl,
                'http://127.0.0.1:1234'
            );
        });

        test('readGitHubReleaseGateRunnerConfig rejects a non-GitHub GITHUB_API_BASE_URL', function () {
            assert.throws(function () {
                readConfig({ GITHUB_API_BASE_URL: 'https://example.invalid/api' });
            }, /GITHUB_API_BASE_URL hostname must be "api\.github\.com", got "example\.invalid"/u);
        });

        test('readGitHubReleaseGateRunnerConfig rejects a non-https public GITHUB_API_BASE_URL', function () {
            const apiBaseUrl = new URL('https://api.github.com');
            apiBaseUrl.protocol = 'http:';

            assert.throws(function () {
                readConfig({ GITHUB_API_BASE_URL: apiBaseUrl.href });
            }, /GITHUB_API_BASE_URL must use https/u);
        });

        test('readGitHubReleaseGateRunnerConfig rejects a malformed GITHUB_API_BASE_URL', function () {
            assert.throws(function () {
                readConfig({ GITHUB_API_BASE_URL: 'not-a-url' });
            }, /GITHUB_API_BASE_URL is not a valid URL/u);
        });

        test('readGitHubReleaseGateRunnerConfig requires GITHUB_OUTPUT', function () {
            assert.throws(function () {
                readGitHubReleaseGateRunnerConfig(
                    createEnvironmentVariableReader(
                        createRequiredEnvironment({
                            GITHUB_OUTPUT: undefined
                        })
                    )
                );
            }, /Missing GITHUB_OUTPUT environment variable/u);
        });

        test('readGitHubReleaseGateRunnerConfig requires GITHUB_REPOSITORY', function () {
            assert.throws(function () {
                readGitHubReleaseGateRunnerConfig(
                    createEnvironmentVariableReader(
                        createRequiredEnvironment({
                            GITHUB_REPOSITORY: undefined
                        })
                    )
                );
            }, /Missing GITHUB_REPOSITORY environment variable/u);
        });

        test('readGitHubReleaseGateRunnerConfig requires GITHUB_TOKEN', function () {
            assert.throws(function () {
                readGitHubReleaseGateRunnerConfig(
                    createEnvironmentVariableReader(
                        createRequiredEnvironment({
                            GITHUB_TOKEN: undefined
                        })
                    )
                );
            }, /Missing GITHUB_TOKEN environment variable/u);
        });
    });

    suite('repository context', function () {
        test('createGitHubRepositoryContext builds the GitHub repository context from config', function () {
            assert.deepStrictEqual(createGitHubRepositoryContext(readConfig()), {
                apiBaseUrl: 'https://api.github.com',
                defaultBranch: 'main',
                owner: 'enormora',
                repo: 'packtory',
                token: 'token'
            });
        });

        test('createGitHubRepositoryContext rejects missing-slash', function () {
            assert.throws(function () {
                createGitHubRepositoryContext({
                    ...readConfig(),
                    repository: 'missing-slash'
                });
            }, /Invalid GITHUB_REPOSITORY value/u);
        });

        test('createGitHubRepositoryContext rejects /packtory', function () {
            assert.throws(function () {
                createGitHubRepositoryContext({
                    ...readConfig(),
                    repository: '/packtory'
                });
            }, /Invalid GITHUB_REPOSITORY value/u);
        });

        test('createGitHubRepositoryContext rejects enormora/', function () {
            assert.throws(function () {
                createGitHubRepositoryContext({
                    ...readConfig(),
                    repository: 'enormora/'
                });
            }, /Invalid GITHUB_REPOSITORY value/u);
        });

        test('createGitHubRepositoryContext rejects enormora/packtory/extra', function () {
            assert.throws(function () {
                createGitHubRepositoryContext({
                    ...readConfig(),
                    repository: 'enormora/packtory/extra'
                });
            }, /Invalid GITHUB_REPOSITORY value/u);
        });
    });
});
