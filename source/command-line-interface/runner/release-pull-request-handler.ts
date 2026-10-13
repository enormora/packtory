import { formatGitHubRepositoryName, parseGitHubRepositoryParts } from './github-repository.ts';
import { collectReleaseOutputFiles, toPreparedReleaseFile, type PreparedReleaseFile } from './release-output-files.ts';
import {
    loadPlannedRelease,
    prepareReleaseChangelogs,
    type PlannedRelease,
    type ReleasePreparationDependencies
} from './release-preparation.ts';
import {
    authorizeReleasePublishFromCommit,
    authorizeReleasePublishFromPullRequest,
    type ReleasePublishAuthorization
} from './release-publish-authorization.ts';
import {
    parseCommandLineInterfacePacktoryConfiguration,
    resolveReleasePullRequestConfiguration,
    type ReleasePullRequestConfiguration
} from './release-pull-request-configuration.ts';
import { runConfiguredGitHubActionsContinuousIntegration } from './release-pull-request-continuous-integration.ts';
import type { ReleasePullRequestGitHubClient } from './release-pull-request-github-client.ts';
import {
    validateReleaseMergeGroupPolicy,
    validateReleasePullRequestPolicy,
    type ReleasePullRequestPolicyConfiguration,
    type ReleasePullRequestPolicyInput
} from './release-pull-request-policy.ts';
import { formatTerminalError, formatTerminalErrorTrace } from './terminal-error-chain.ts';

type Logger = (message: string) => void;
type EnvironmentReader = (name: string) => string | undefined;
type ReleasePullRequestFileManager = ReleasePreparationDependencies['fileManager'] & {
    readonly writeFile: (filePath: string, content: string) => Promise<void>;
};

type AuthorizePublishReleasePullRequestFlags = {
    readonly command: 'authorize-publish';
    readonly releasePullRequestNumber: string | undefined;
};

type MaintainReleasePullRequestFlags = {
    readonly command: 'maintain';
    readonly noDryRun: boolean;
    readonly releasePullRequestNumber: undefined;
};

type ValidateReleasePullRequestFlags = {
    readonly command: 'validate';
    readonly releasePullRequestNumber: undefined;
};

type ReleasePullRequestWriteFlags = AuthorizePublishReleasePullRequestFlags | MaintainReleasePullRequestFlags;
type ReleasePullRequestFlags = ReleasePullRequestWriteFlags | ValidateReleasePullRequestFlags;
type GitHubClientContext = {
    readonly applicationProgrammingInterfaceBaseAddress: string;
    readonly owner: string;
    readonly repository: string;
    readonly token: string | undefined;
};

export type ReleasePullRequestHandlerDependencies = {
    readonly createPullRequestLogEngine: ReleasePreparationDependencies['createPullRequestLogEngine'];
    readonly createReleasePullRequestGitHubClient: (context: GitHubClientContext) => ReleasePullRequestGitHubClient;
    readonly currentDate: ReleasePreparationDependencies['currentDate'];
    readonly fileManager: ReleasePullRequestFileManager;
    readonly flags: ReleasePullRequestFlags;
    readonly log: Logger;
    readonly packtory: ReleasePreparationDependencies['packtory'];
    readonly readEnvironmentVariable: EnvironmentReader;
    readonly readPackageInformation: ReleasePreparationDependencies['readPackageInformation'];
    readonly sleep: (milliseconds: number) => Promise<void>;
    readonly spinnerRenderer: ReleasePreparationDependencies['spinnerRenderer'];
    readonly configurationLoader: ReleasePreparationDependencies['configurationLoader'];
    readonly trace: boolean;
    readonly workingDirectory: string;
};

type LoadedReleasePullRequestConfiguration = {
    readonly configuration: ReleasePullRequestConfiguration;
    readonly policyConfiguration: ReleasePullRequestPolicyConfiguration;
};
type PreparedReleaseCommit = {
    readonly baseHead: string;
    readonly files: readonly PreparedReleaseFile[];
};

type GitHubMergeGroupEvent = {
    readonly base_hash?: string | undefined;
    readonly head_sha?: string | undefined;
};
type GitHubPullRequestEvent = {
    readonly number?: number | undefined;
};
type GitHubEvent = {
    readonly merge_group?: GitHubMergeGroupEvent | undefined;
    readonly pull_request?: GitHubPullRequestEvent | undefined;
};
type GitHubContext = {
    readonly client: ReleasePullRequestGitHubClient;
    readonly repository: string;
};
type GitHubRepositoryNameParts = {
    readonly owner: string;
    readonly repository: string;
};
type GitHubRepository = GitHubRepositoryNameParts & {
    readonly name: string;
};

const defaultGitHubApplicationProgrammingInterfaceBaseAddress = 'https://api.github.com';

function toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

function formatHandlerError(error: unknown): string {
    return formatTerminalError(toError(error));
}

function formatHandlerTrace(error: unknown): string {
    return formatTerminalErrorTrace(toError(error));
}

function readGitHubToken(
    dependencies: Pick<ReleasePullRequestHandlerDependencies, 'readEnvironmentVariable'>
): string | undefined {
    return dependencies.readEnvironmentVariable('GH_TOKEN') ??
        dependencies.readEnvironmentVariable('GITHUB_TOKEN');
}

function parseGitHubRepositoryName(repositoryName: string): GitHubRepositoryNameParts {
    const ownerSeparatorIndex = repositoryName.indexOf('/');
    const owner = repositoryName.slice(0, ownerSeparatorIndex);
    const repositoryPathSegment = repositoryName.slice(ownerSeparatorIndex + 1);
    if (
        !repositoryName.includes('/') || owner.length === 0 || repositoryPathSegment.length === 0 ||
        repositoryPathSegment.includes('/')
    ) {
        throw new Error('GITHUB_REPOSITORY must use owner/repo format');
    }
    return { owner, repository: repositoryPathSegment };
}

async function readGitHubRepository(
    dependencies: Pick<ReleasePullRequestHandlerDependencies, 'readEnvironmentVariable' | 'readPackageInformation'>
): Promise<GitHubRepository> {
    const repositoryName = dependencies.readEnvironmentVariable('GITHUB_REPOSITORY');
    if (repositoryName !== undefined) {
        const { owner, repository: repositoryPathSegment } = parseGitHubRepositoryName(repositoryName);
        return { name: repositoryName, owner, repository: repositoryPathSegment };
    }
    const packageInformation = await dependencies.readPackageInformation();
    const repository = parseGitHubRepositoryParts(packageInformation);
    return { ...repository, name: formatGitHubRepositoryName(packageInformation) };
}

async function createGitHubClient(dependencies: ReleasePullRequestHandlerDependencies): Promise<GitHubContext> {
    const repository = await readGitHubRepository(dependencies);
    return {
        client: dependencies.createReleasePullRequestGitHubClient({
            applicationProgrammingInterfaceBaseAddress: dependencies.readEnvironmentVariable('GITHUB_API_BASE_URL') ??
                defaultGitHubApplicationProgrammingInterfaceBaseAddress,
            owner: repository.owner,
            repository: repository.repository,
            token: readGitHubToken(dependencies)
        }),
        repository: repository.name
    };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === 'object' && value !== null;
}

const isGitHubEvent: (value: unknown) => value is GitHubEvent = isRecord;

function parseReleasePullRequestConfiguration(
    dependencies: Pick<ReleasePullRequestHandlerDependencies, 'workingDirectory'>,
    rawConfiguration: unknown
): LoadedReleasePullRequestConfiguration {
    const parsedConfiguration = parseCommandLineInterfacePacktoryConfiguration(rawConfiguration);
    if (parsedConfiguration === undefined) {
        throw new Error('The loaded config is invalid for release PR management');
    }
    const configuration = resolveReleasePullRequestConfiguration(parsedConfiguration);
    return {
        configuration,
        policyConfiguration: {
            allowedFiles: new Set(
                collectReleaseOutputFiles({
                    configuration: parsedConfiguration,
                    workingDirectory: dependencies.workingDirectory
                })
            ),
            automationAuthor: configuration.automationAuthor,
            branch: configuration.branch,
            commitSubject: configuration.commitSubject,
            defaultBranch: configuration.defaultBranch,
            label: configuration.label,
            title: configuration.title
        }
    };
}

async function loadReleasePullRequestConfiguration(
    dependencies: Pick<ReleasePullRequestHandlerDependencies, 'configurationLoader' | 'workingDirectory'>
): Promise<LoadedReleasePullRequestConfiguration> {
    return parseReleasePullRequestConfiguration(dependencies, await dependencies.configurationLoader.load());
}

function hasChangedPackages(planned: PlannedRelease): boolean {
    return planned.packages.some(function (packagePlan) {
        return packagePlan.changed;
    });
}

async function closeReleaseState(
    client: ReleasePullRequestGitHubClient,
    configuration: ReleasePullRequestConfiguration
): Promise<void> {
    await client.closeOpenReleasePullRequests({
        baseBranch: configuration.defaultBranch,
        releaseBranch: configuration.branch
    });
    await client.deleteBranch(configuration.branch);
}

async function prepareReleasePullRequest(
    dependencies: ReleasePullRequestHandlerDependencies,
    client: ReleasePullRequestGitHubClient,
    configuration: ReleasePullRequestConfiguration
): Promise<PreparedReleaseCommit | undefined> {
    const baseHead = await client.getBranchHeadHash(configuration.defaultBranch);
    const planned = await loadPlannedRelease(dependencies);
    if (planned === undefined) {
        throw new Error('Release preparation failed');
    }
    if (!hasChangedPackages(planned)) {
        return undefined;
    }
    const { writtenFiles } = await prepareReleaseChangelogs(dependencies, planned, true);
    return {
        baseHead,
        files: writtenFiles.map(function (file) {
            return toPreparedReleaseFile(dependencies.workingDirectory, file);
        })
    };
}

async function updateReleasePullRequest(
    dependencies: ReleasePullRequestHandlerDependencies,
    client: ReleasePullRequestGitHubClient,
    configuration: ReleasePullRequestConfiguration,
    releaseCommit: PreparedReleaseCommit
): Promise<number> {
    const releaseHead = await client.createCommitOnBranch({
        additions: releaseCommit.files.map(function (file) {
            return { contents: file.contentBase64, path: file.path };
        }),
        branch: configuration.branch,
        expectedHeadObjectIdentifier: releaseCommit.baseHead,
        message: configuration.commitSubject
    });
    const pullRequestNumber = await client.createOrUpdateReleasePullRequest({
        baseBranch: configuration.defaultBranch,
        body: configuration.body,
        label: configuration.label,
        releaseBranch: configuration.branch,
        title: configuration.title
    });
    const continuousIntegrationSucceeded = await runConfiguredGitHubActionsContinuousIntegration({
        client,
        configuration,
        headHash: releaseHead,
        sleep: dependencies.sleep
    });
    dependencies.log(`Release PR #${pullRequestNumber} points at ${releaseHead}`);
    return continuousIntegrationSucceeded ? 0 : 1;
}

async function finishReleasePullRequestMaintenance(
    dependencies: ReleasePullRequestHandlerDependencies,
    client: ReleasePullRequestGitHubClient,
    configuration: ReleasePullRequestConfiguration,
    releaseCommit: PreparedReleaseCommit | undefined
): Promise<number> {
    if (releaseCommit === undefined) {
        await closeReleaseState(client, configuration);
        dependencies.log('No release content remains');
        return 0;
    }
    return updateReleasePullRequest(dependencies, client, configuration, releaseCommit);
}

type MaintainReleasePullRequestHandlerDependencies = ReleasePullRequestHandlerDependencies & {
    readonly flags: Extract<ReleasePullRequestFlags, { readonly command: 'maintain'; }>;
};

async function runMaintain(dependencies: MaintainReleasePullRequestHandlerDependencies): Promise<number> {
    if (!dependencies.flags.noDryRun) {
        dependencies.log('Release PR writes require --no-dry-run');
        return 1;
    }
    const releaseSettings = await loadReleasePullRequestConfiguration(dependencies);
    if (
        dependencies.readEnvironmentVariable('GITHUB_EVENT_NAME') === 'workflow_dispatch' &&
        dependencies.readEnvironmentVariable('GITHUB_REF_NAME') === releaseSettings.configuration.branch
    ) {
        dependencies.log(
            `Skipping release PR maintenance during dispatched validation for ${releaseSettings.configuration.branch}`
        );
        return 0;
    }
    const { client } = await createGitHubClient(dependencies);
    const releaseCommit = await prepareReleasePullRequest(dependencies, client, releaseSettings.configuration);
    return finishReleasePullRequestMaintenance(dependencies, client, releaseSettings.configuration, releaseCommit);
}

function readRequiredEnvironmentVariable(dependencies: ReleasePullRequestHandlerDependencies, name: string): string {
    const value = dependencies.readEnvironmentVariable(name);
    if (value === undefined || value.length === 0) {
        throw new Error(`${name} must be set`);
    }
    return value;
}

function parseJavaScriptObjectNotationString(content: string): unknown {
    return JSON.parse(content) as unknown;
}

async function readGitHubEvent(dependencies: ReleasePullRequestHandlerDependencies): Promise<GitHubEvent> {
    const eventPath = readRequiredEnvironmentVariable(dependencies, 'GITHUB_EVENT_PATH');
    const parsedEvent = parseJavaScriptObjectNotationString(await dependencies.fileManager.readFile(eventPath));
    if (!isGitHubEvent(parsedEvent)) {
        throw new Error('GitHub event payload must be an object');
    }
    return parsedEvent;
}

async function toPolicyInput(
    client: ReleasePullRequestGitHubClient,
    expectedBaseHash: string,
    pullRequestNumber: number
): Promise<ReleasePullRequestPolicyInput> {
    const pullRequest = await client.getPullRequestHead(pullRequestNumber);
    return {
        author: pullRequest.author,
        changedFiles: pullRequest.changedFiles,
        expectedBaseHash,
        headReference: pullRequest.headReference,
        labels: pullRequest.labels,
        parentHashes: pullRequest.parentHashes,
        subject: pullRequest.subject,
        title: pullRequest.title
    };
}

async function runPullRequestValidation(
    client: ReleasePullRequestGitHubClient,
    configuration: LoadedReleasePullRequestConfiguration,
    event: GitHubEvent
): Promise<void> {
    const pullRequestNumber = event.pull_request?.number;
    if (pullRequestNumber === undefined) {
        throw new Error('GitHub pull_request event payload is missing pull_request.number');
    }
    const expectedBaseHash = await client.getBranchHeadHash(configuration.configuration.defaultBranch);
    const policyInput = await toPolicyInput(client, expectedBaseHash, pullRequestNumber);
    if (policyInput.labels.includes(configuration.configuration.label)) {
        validateReleasePullRequestPolicy(policyInput, configuration.policyConfiguration);
    }
}

async function runMergeGroupValidation(
    client: ReleasePullRequestGitHubClient,
    configuration: LoadedReleasePullRequestConfiguration,
    event: GitHubEvent
): Promise<void> {
    const headHash = event.merge_group?.head_sha;
    const expectedBaseHash = event.merge_group?.base_hash;
    if (headHash === undefined || expectedBaseHash === undefined) {
        throw new Error('GitHub merge_group event payload is missing merge group SHAs');
    }
    const pullRequests = await client.listCommitPullRequests(headHash);
    const policyInputs = await Promise.all(
        pullRequests.map(async function (pullRequest) {
            return toPolicyInput(client, expectedBaseHash, pullRequest.number);
        })
    );
    validateReleaseMergeGroupPolicy({ pullRequests: policyInputs }, configuration.policyConfiguration);
}

async function validateGitHubEvent(
    client: ReleasePullRequestGitHubClient,
    configuration: LoadedReleasePullRequestConfiguration,
    event: GitHubEvent,
    eventName: string
): Promise<void> {
    if (eventName === 'pull_request') {
        await runPullRequestValidation(client, configuration, event);
        return;
    }
    if (eventName === 'merge_group') {
        await runMergeGroupValidation(client, configuration, event);
        return;
    }
    throw new Error('release-pull-request validate only supports pull_request and merge_group events');
}

async function runValidate(dependencies: ReleasePullRequestHandlerDependencies): Promise<number> {
    const loadedConfiguration = await loadReleasePullRequestConfiguration(dependencies);
    const { client } = await createGitHubClient(dependencies);
    const eventName = readRequiredEnvironmentVariable(dependencies, 'GITHUB_EVENT_NAME');
    const event = await readGitHubEvent(dependencies);
    await validateGitHubEvent(client, loadedConfiguration, event, eventName);
    dependencies.log('Release PR policy passed.');
    return 0;
}

function formatAuthorizationOutput(authorization: ReleasePublishAuthorization): readonly string[] {
    if (!authorization.shouldPublish) {
        return [ 'should_publish=false' ];
    }
    return [
        'should_publish=true',
        `publish_commit_sha=${authorization.publishCommitHash}`,
        `release_commit_sha=${authorization.releaseCommitHash}`,
        `release_pull_request_number=${authorization.releasePullRequestNumber}`
    ];
}

async function readExistingOutput(
    dependencies: ReleasePullRequestHandlerDependencies,
    githubOutputPath: string
): Promise<string> {
    try {
        return await dependencies.fileManager.readFile(githubOutputPath);
    } catch {
        return '';
    }
}

async function writeAuthorizationOutput(
    dependencies: ReleasePullRequestHandlerDependencies,
    authorization: ReleasePublishAuthorization
): Promise<void> {
    const output = `${formatAuthorizationOutput(authorization).join('\n')}\n`;
    const githubOutputPath = dependencies.readEnvironmentVariable('GITHUB_OUTPUT');
    if (githubOutputPath === undefined) {
        dependencies.log(output.trimEnd());
        return;
    }
    await dependencies.fileManager.writeFile(
        githubOutputPath,
        `${await readExistingOutput(dependencies, githubOutputPath)}${output}`
    );
}

async function authorizeManualPublish(
    configuration: LoadedReleasePullRequestConfiguration,
    dependencies: ReleasePullRequestHandlerDependencies,
    github: GitHubContext,
    releasePullRequestNumber: string
): Promise<ReleasePublishAuthorization> {
    const referenceName = readRequiredEnvironmentVariable(dependencies, 'GITHUB_REF_NAME');
    if (referenceName !== configuration.configuration.defaultBranch) {
        throw new Error(`Manual release publish retries must run from ${configuration.configuration.defaultBranch}`);
    }
    return authorizeReleasePublishFromPullRequest({
        configuration: configuration.policyConfiguration,
        pullRequest: await github.client.getPullRequest(Number(releasePullRequestNumber)),
        repository: github.repository
    });
}

async function authorizePushPublish(
    configuration: LoadedReleasePullRequestConfiguration,
    dependencies: ReleasePullRequestHandlerDependencies,
    github: GitHubContext
): Promise<ReleasePublishAuthorization> {
    const commitHash = readRequiredEnvironmentVariable(dependencies, 'GITHUB_SHA');
    return authorizeReleasePublishFromCommit({
        commitHash,
        configuration: configuration.policyConfiguration,
        pullRequests: await github.client.listCommitPullRequests(commitHash),
        repository: github.repository
    });
}

async function authorizePublish(
    configuration: LoadedReleasePullRequestConfiguration,
    dependencies: ReleasePullRequestHandlerDependencies,
    github: GitHubContext
): Promise<ReleasePublishAuthorization> {
    const { releasePullRequestNumber } = dependencies.flags;
    if (releasePullRequestNumber !== undefined) {
        return authorizeManualPublish(configuration, dependencies, github, releasePullRequestNumber);
    }
    return authorizePushPublish(configuration, dependencies, github);
}

async function runAuthorizePublish(dependencies: ReleasePullRequestHandlerDependencies): Promise<number> {
    const configuration = await loadReleasePullRequestConfiguration(dependencies);
    const github = await createGitHubClient(dependencies);
    await writeAuthorizationOutput(dependencies, await authorizePublish(configuration, dependencies, github));
    return 0;
}

async function runReleasePullRequestCommand(dependencies: ReleasePullRequestHandlerDependencies): Promise<number> {
    if (dependencies.flags.command === 'maintain') {
        return runMaintain({ ...dependencies, flags: dependencies.flags });
    }
    if (dependencies.flags.command === 'validate') {
        return runValidate(dependencies);
    }
    return runAuthorizePublish(dependencies);
}

function stopSpinnersAndReturn(dependencies: ReleasePullRequestHandlerDependencies, exitCode: number): number {
    dependencies.spinnerRenderer.stopAll();
    return exitCode;
}

export async function runReleasePullRequestHandler(
    dependencies: ReleasePullRequestHandlerDependencies
): Promise<number> {
    try {
        return stopSpinnersAndReturn(dependencies, await runReleasePullRequestCommand(dependencies));
    } catch (error: unknown) {
        const formatError = dependencies.trace ? formatHandlerTrace : formatHandlerError;
        dependencies.log(formatError(error));
        return stopSpinnersAndReturn(dependencies, 1);
    }
}
