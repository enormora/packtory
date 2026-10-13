import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    createGitHubRepositoryContext,
    readGitHubReleaseGateRunnerConfiguration,
    type GitHubReleaseGateRunnerConfiguration
} from './runner-configuration.ts';

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

function readConfiguration(overrides: FakeEnvironment = {}): Readonly<GitHubReleaseGateRunnerConfiguration> {
    return readGitHubReleaseGateRunnerConfiguration(
        createEnvironmentVariableReader(createRequiredEnvironment(overrides))
    );
}

suite('github-release-gate-runner-config', function () {
    suite('config reading', function () {
        test('readGitHubReleaseGateRunnerConfiguration uses defaults for optional environment variables', function () {
            assert.deepStrictEqual(readConfiguration(), {
                continuousIntegrationWorkflowFile: 'continuous-integration.yml',
                dependencyOnlyMinimumAgeDays: 7,
                defaultBranch: 'main',
                githubApplicationProgrammingInterfaceBaseAddress: 'https://api.github.com',
                githubOutputPath: '/workspace/github-output.txt',
                maximumLatencyHours: 24,
                quietPeriodMinutes: 45,
                repository: 'enormora/packtory',
                token: 'token'
            });
        });

        test('readGitHubReleaseGateRunnerConfiguration honors custom environment values', function () {
            assert.deepStrictEqual(
                readConfiguration({
                    CI_WORKFLOW_FILE: 'custom continuous-integration.yml',
                    DEFAULT_BRANCH: 'release',
                    DEPENDENCY_ONLY_MINIMUM_AGE_DAYS: '9',
                    MAXIMUM_LATENCY_HOURS: '1',
                    QUIET_PERIOD_MINUTES: '3'
                }),
                {
                    continuousIntegrationWorkflowFile: 'custom continuous-integration.yml',
                    dependencyOnlyMinimumAgeDays: 9,
                    defaultBranch: 'release',
                    githubApplicationProgrammingInterfaceBaseAddress: 'https://api.github.com',
                    githubOutputPath: '/workspace/github-output.txt',
                    maximumLatencyHours: 1,
                    quietPeriodMinutes: 3,
                    repository: 'enormora/packtory',
                    token: 'token'
                }
            );
        });

        test('readGitHubReleaseGateRunnerConfiguration accepts a loopback GITHUB_API_BASE_URL for testing', function () {
            assert.strictEqual(
                readConfiguration({ GITHUB_API_BASE_URL: 'http://127.0.0.1:1234' })
                    .githubApplicationProgrammingInterfaceBaseAddress,
                'http://127.0.0.1:1234'
            );
        });

        test('readGitHubReleaseGateRunnerConfiguration rejects a non-GitHub GITHUB_API_BASE_URL', function () {
            assert.throws(function () {
                readConfiguration({ GITHUB_API_BASE_URL: 'https://example.invalid/api' });
            }, /GITHUB_API_BASE_URL hostname must be "api\.github\.com", got "example\.invalid"/u);
        });

        test('readGitHubReleaseGateRunnerConfiguration rejects a non-https public GITHUB_API_BASE_URL', function () {
            const applicationProgrammingInterfaceBaseAddress = new URL('https://api.github.com');
            applicationProgrammingInterfaceBaseAddress.protocol = 'http:';

            assert.throws(function () {
                readConfiguration({ GITHUB_API_BASE_URL: applicationProgrammingInterfaceBaseAddress.href });
            }, /GITHUB_API_BASE_URL must use https/u);
        });

        test('readGitHubReleaseGateRunnerConfiguration rejects a malformed GITHUB_API_BASE_URL', function () {
            assert.throws(function () {
                readConfiguration({ GITHUB_API_BASE_URL: 'not-a-url' });
            }, /GITHUB_API_BASE_URL is not a valid URL/u);
        });

        test('readGitHubReleaseGateRunnerConfiguration requires GITHUB_OUTPUT', function () {
            assert.throws(function () {
                readGitHubReleaseGateRunnerConfiguration(
                    createEnvironmentVariableReader(
                        createRequiredEnvironment({
                            GITHUB_OUTPUT: undefined
                        })
                    )
                );
            }, /Missing GITHUB_OUTPUT environment variable/u);
        });

        test('readGitHubReleaseGateRunnerConfiguration requires GITHUB_REPOSITORY', function () {
            assert.throws(function () {
                readGitHubReleaseGateRunnerConfiguration(
                    createEnvironmentVariableReader(
                        createRequiredEnvironment({
                            GITHUB_REPOSITORY: undefined
                        })
                    )
                );
            }, /Missing GITHUB_REPOSITORY environment variable/u);
        });

        test('readGitHubReleaseGateRunnerConfiguration requires GITHUB_TOKEN', function () {
            assert.throws(function () {
                readGitHubReleaseGateRunnerConfiguration(
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
            assert.deepStrictEqual(createGitHubRepositoryContext(readConfiguration()), {
                applicationProgrammingInterfaceBaseAddress: 'https://api.github.com',
                defaultBranch: 'main',
                owner: 'enormora',
                repository: 'packtory',
                token: 'token'
            });
        });

        test('createGitHubRepositoryContext rejects missing-slash', function () {
            assert.throws(function () {
                createGitHubRepositoryContext({
                    ...readConfiguration(),
                    repository: 'missing-slash'
                });
            }, /Invalid GITHUB_REPOSITORY value/u);
        });

        test('createGitHubRepositoryContext rejects /packtory', function () {
            assert.throws(function () {
                createGitHubRepositoryContext({
                    ...readConfiguration(),
                    repository: '/packtory'
                });
            }, /Invalid GITHUB_REPOSITORY value/u);
        });

        test('createGitHubRepositoryContext rejects enormora/', function () {
            assert.throws(function () {
                createGitHubRepositoryContext({
                    ...readConfiguration(),
                    repository: 'enormora/'
                });
            }, /Invalid GITHUB_REPOSITORY value/u);
        });

        test('createGitHubRepositoryContext rejects enormora/packtory/extra', function () {
            assert.throws(function () {
                createGitHubRepositoryContext({
                    ...readConfiguration(),
                    repository: 'enormora/packtory/extra'
                });
            }, /Invalid GITHUB_REPOSITORY value/u);
        });
    });
});
