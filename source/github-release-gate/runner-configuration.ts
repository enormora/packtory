import * as gitHubAddress from './validate-application-programming-interface-base-address.ts';

export type GitHubReleaseGateRunnerConfiguration = {
    readonly continuousIntegrationWorkflowFile: string;
    readonly dependencyOnlyMinimumAgeDays: number;
    readonly defaultBranch: string;
    readonly githubApplicationProgrammingInterfaceBaseAddress: string;
    readonly githubOutputPath: string;
    readonly maximumLatencyHours: number;
    readonly quietPeriodMinutes: number;
    readonly repository: string;
    readonly token: string;
};

export type GitHubRepositoryContext = {
    readonly applicationProgrammingInterfaceBaseAddress: string;
    readonly defaultBranch: string;
    readonly owner: string;
    readonly repository: string;
    readonly token: string;
};

type EnvironmentVariableReader = (variableName: string) => string | undefined;
type RepositoryParts = {
    readonly owner: string;
    readonly repository: string;
};

const defaultDependencyOnlyMinimumAgeDays = 7;
const defaultMaximumLatencyHours = 24;
const defaultQuietPeriodMinutes = 45;

function defaultContinuousIntegrationWorkflowFile(): string {
    return 'continuous-integration.yml';
}

function defaultGitHubApplicationProgrammingInterfaceBaseAddress(): string {
    return 'https://api.github.com';
}

function defaultMainBranch(): string {
    return 'main';
}

function parseInteger(value: string | undefined, fallbackValue: number): number {
    return value === undefined ? fallbackValue : Number.parseInt(value, 10);
}

function getRequiredEnvironmentVariable(
    getEnvironmentVariable: EnvironmentVariableReader,
    variableName: string
): string {
    const value = getEnvironmentVariable(variableName);

    if (value === undefined) {
        throw new Error(`Missing ${variableName} environment variable`);
    }

    return value;
}

export function readGitHubReleaseGateRunnerConfiguration(
    getEnvironmentVariable: EnvironmentVariableReader
): Readonly<GitHubReleaseGateRunnerConfiguration> {
    const serviceAddress = getEnvironmentVariable('GITHUB_API_BASE_URL') ??
        defaultGitHubApplicationProgrammingInterfaceBaseAddress();
    return {
        continuousIntegrationWorkflowFile: getEnvironmentVariable('CI_WORKFLOW_FILE') ??
            defaultContinuousIntegrationWorkflowFile(),
        dependencyOnlyMinimumAgeDays: parseInteger(
            getEnvironmentVariable('DEPENDENCY_ONLY_MINIMUM_AGE_DAYS'),
            defaultDependencyOnlyMinimumAgeDays
        ),
        defaultBranch: getEnvironmentVariable('DEFAULT_BRANCH') ?? defaultMainBranch(),
        githubApplicationProgrammingInterfaceBaseAddress: gitHubAddress
            .assertGitHubApplicationProgrammingInterfaceBaseAddress(serviceAddress),
        githubOutputPath: getRequiredEnvironmentVariable(getEnvironmentVariable, 'GITHUB_OUTPUT'),
        maximumLatencyHours: parseInteger(getEnvironmentVariable('MAXIMUM_LATENCY_HOURS'), defaultMaximumLatencyHours),
        quietPeriodMinutes: parseInteger(getEnvironmentVariable('QUIET_PERIOD_MINUTES'), defaultQuietPeriodMinutes),
        repository: getRequiredEnvironmentVariable(getEnvironmentVariable, 'GITHUB_REPOSITORY'),
        token: getRequiredEnvironmentVariable(getEnvironmentVariable, 'GITHUB_TOKEN')
    };
}

function splitRepository(repository: string): RepositoryParts {
    const firstSlashIndex = repository.indexOf('/');

    if (
        firstSlashIndex <= 0 ||
        firstSlashIndex !== repository.lastIndexOf('/') ||
        firstSlashIndex === repository.length - 1
    ) {
        throw new Error(`Invalid GITHUB_REPOSITORY value: ${repository}`);
    }

    return {
        owner: repository.slice(0, firstSlashIndex),
        repository: repository.slice(firstSlashIndex + 1)
    };
}

export function createGitHubRepositoryContext(
    configuration: Readonly<GitHubReleaseGateRunnerConfiguration>
): GitHubRepositoryContext {
    const repository = splitRepository(configuration.repository);

    return {
        applicationProgrammingInterfaceBaseAddress: configuration.githubApplicationProgrammingInterfaceBaseAddress,
        defaultBranch: configuration.defaultBranch,
        owner: repository.owner,
        repository: repository.repository,
        token: configuration.token
    };
}
