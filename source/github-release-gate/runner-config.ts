export type GitHubReleaseGateRunnerConfig = {
    readonly ciWorkflowFile: string;
    readonly dependencyOnlyMinAgeDays: number;
    readonly defaultBranch: string;
    readonly githubApiBaseUrl: string;
    readonly githubOutputPath: string;
    readonly maxLatencyHours: number;
    readonly quietPeriodMinutes: number;
    readonly repository: string;
    readonly token: string;
};

export type GitHubRepositoryContext = {
    readonly apiBaseUrl: string;
    readonly defaultBranch: string;
    readonly owner: string;
    readonly repo: string;
    readonly token: string;
};

const defaultCiWorkflowFile = 'ci.yml';
const defaultDependencyOnlyMinAgeDays = 7;
const defaultGitHubApiBaseUrl = 'https://api.github.com';
const defaultMainBranch = 'main';
const defaultMaxLatencyHours = 24;
const defaultQuietPeriodMinutes = 45;

function parseInteger(value: string | undefined, fallbackValue: number): number {
    return value === undefined ? fallbackValue : Number.parseInt(value, 10);
}

function getRequiredEnvironmentVariable(
    getEnvironmentVariable: (variableName: string) => string | undefined,
    variableName: string
): string {
    const value = getEnvironmentVariable(variableName);

    if (value === undefined) {
        throw new Error(`Missing ${variableName} environment variable`);
    }

    return value;
}

export function readGitHubReleaseGateRunnerConfig(
    getEnvironmentVariable: (variableName: string) => string | undefined
): Readonly<GitHubReleaseGateRunnerConfig> {
    return {
        ciWorkflowFile: getEnvironmentVariable('CI_WORKFLOW_FILE') ?? defaultCiWorkflowFile,
        dependencyOnlyMinAgeDays: parseInteger(
            getEnvironmentVariable('DEPENDENCY_ONLY_MIN_AGE_DAYS'),
            defaultDependencyOnlyMinAgeDays
        ),
        defaultBranch: getEnvironmentVariable('DEFAULT_BRANCH') ?? defaultMainBranch,
        githubApiBaseUrl: getEnvironmentVariable('GITHUB_API_BASE_URL') ?? defaultGitHubApiBaseUrl,
        githubOutputPath: getRequiredEnvironmentVariable(getEnvironmentVariable, 'GITHUB_OUTPUT'),
        maxLatencyHours: parseInteger(getEnvironmentVariable('MAX_LATENCY_HOURS'), defaultMaxLatencyHours),
        quietPeriodMinutes: parseInteger(getEnvironmentVariable('QUIET_PERIOD_MINUTES'), defaultQuietPeriodMinutes),
        repository: getRequiredEnvironmentVariable(getEnvironmentVariable, 'GITHUB_REPOSITORY'),
        token: getRequiredEnvironmentVariable(getEnvironmentVariable, 'GITHUB_TOKEN')
    };
}

function splitRepository(repository: string): { readonly owner: string; readonly repo: string } {
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
        repo: repository.slice(firstSlashIndex + 1)
    };
}

export function createGitHubRepositoryContext(
    config: Readonly<GitHubReleaseGateRunnerConfig>
): GitHubRepositoryContext {
    const repository = splitRepository(config.repository);

    return {
        apiBaseUrl: config.githubApiBaseUrl,
        defaultBranch: config.defaultBranch,
        owner: repository.owner,
        repo: repository.repo,
        token: config.token
    };
}
