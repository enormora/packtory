import { parseValidConfig } from './changelog-destinations.ts';
import { formatGitHubRepositoryName, parseGitHubRepositoryParts } from './github-repository.ts';
import {
    authorizeReleasePublishFromCommit,
    authorizeReleasePublishFromPullRequest,
    type ReleasePublishAuthorization
} from './release-publish-authorization.ts';
import { collectReleaseOutputFiles, releaseCommitFilePath } from './release-output-files.ts';
import { runConfiguredGitHubActionsCi } from './release-pull-request-ci.ts';
import {
    parseReleasePullRequestConfigContainer,
    resolveReleasePullRequestConfig,
    type ReleasePullRequestConfig
} from './release-pull-request-config.ts';
import {
    loadPlannedRelease,
    type PlannedRelease,
    prepareReleaseChangelogs,
    type ReleasePreparationDeps
} from './release-preparation.ts';
import type { ReleasePullRequestGitHubClient } from './release-pr-github-client.ts';
import {
    validateReleaseMergeGroupPolicy,
    validateReleasePullRequestPolicy,
    type ReleasePullRequestPolicyConfig,
    type ReleasePullRequestPolicyInput
} from './release-pull-request-policy.ts';

type Logger = (message: string) => void;
type EnvironmentReader = (name: string) => string | undefined;
type ReleasePullRequestFileManager = ReleasePreparationDeps['fileManager'] & {
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
    readonly owner: string;
    readonly repo: string;
    readonly token: string | undefined;
};

export type ReleasePullRequestHandlerDependencies = {
    readonly createPrLogEngine: ReleasePreparationDeps['createPrLogEngine'];
    readonly createReleasePullRequestGitHubClient: (context: GitHubClientContext) => ReleasePullRequestGitHubClient;
    readonly currentDate: ReleasePreparationDeps['currentDate'];
    readonly fileManager: ReleasePullRequestFileManager;
    readonly flags: ReleasePullRequestFlags;
    readonly log: Logger;
    readonly packtory: ReleasePreparationDeps['packtory'];
    readonly readEnvironmentVariable: EnvironmentReader;
    readonly readPackageInfo: ReleasePreparationDeps['readPackageInfo'];
    readonly sleep: (milliseconds: number) => Promise<void>;
    readonly spinnerRenderer: ReleasePreparationDeps['spinnerRenderer'];
    readonly configLoader: ReleasePreparationDeps['configLoader'];
    readonly workingDirectory: string;
};

type LoadedReleasePullRequestConfig = {
    readonly config: ReleasePullRequestConfig;
    readonly policyConfig: ReleasePullRequestPolicyConfig;
};
type PreparedReleaseCommit = {
    readonly baseHead: string;
    readonly files: readonly PreparedReleaseFile[];
};
type PreparedReleaseFile = {
    readonly contentBase64: string;
    readonly path: string;
};
type WrittenReleaseChangelogFile = {
    readonly content: string;
    readonly filePath: string;
};

type GitHubMergeGroupEvent = {
    readonly base_sha?: string | undefined;
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
    readonly repo: string;
};
type GitHubRepository = GitHubRepositoryNameParts & {
    readonly name: string;
};
function formatHandlerError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
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
    const repo = repositoryName.slice(ownerSeparatorIndex + 1);
    if (!repositoryName.includes('/') || owner.length === 0 || repo.length === 0 || repo.includes('/')) {
        throw new Error('GITHUB_REPOSITORY must use owner/repo format');
    }
    return { owner, repo };
}

async function readGitHubRepository(
    dependencies: Pick<ReleasePullRequestHandlerDependencies, 'readEnvironmentVariable' | 'readPackageInfo'>
): Promise<GitHubRepository> {
    const repositoryName = dependencies.readEnvironmentVariable('GITHUB_REPOSITORY');
    if (repositoryName !== undefined) {
        const { owner, repo } = parseGitHubRepositoryName(repositoryName);
        return { name: repositoryName, owner, repo };
    }
    const packageInfo = await dependencies.readPackageInfo();
    const repository = parseGitHubRepositoryParts(packageInfo);
    return { ...repository, name: formatGitHubRepositoryName(packageInfo) };
}

async function createGitHubClient(dependencies: ReleasePullRequestHandlerDependencies): Promise<GitHubContext> {
    const repository = await readGitHubRepository(dependencies);
    return {
        client: dependencies.createReleasePullRequestGitHubClient({
            owner: repository.owner,
            repo: repository.repo,
            token: readGitHubToken(dependencies)
        }),
        repository: repository.name
    };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === 'object' && value !== null;
}

const isGitHubEvent: (value: unknown) => value is GitHubEvent = isRecord;

function parseReleasePullRequestConfig(
    dependencies: Pick<ReleasePullRequestHandlerDependencies, 'workingDirectory'>,
    rawConfig: unknown
): LoadedReleasePullRequestConfig {
    const parsedConfig = parseValidConfig(rawConfig);
    if (parsedConfig === undefined) {
        throw new Error('The loaded config is invalid for release PR management');
    }
    const releasePullRequestConfigContainer = parseReleasePullRequestConfigContainer(rawConfig);
    if (releasePullRequestConfigContainer === undefined) {
        throw new Error('The loaded config is invalid for release PR management');
    }
    const config = resolveReleasePullRequestConfig(releasePullRequestConfigContainer);
    return {
        config,
        policyConfig: {
            allowedFiles: new Set(
                collectReleaseOutputFiles({ config: parsedConfig, workingDirectory: dependencies.workingDirectory })
            ),
            automationAuthor: config.automationAuthor,
            branch: config.branch,
            commitSubject: config.commitSubject,
            defaultBranch: config.defaultBranch,
            label: config.label,
            title: config.title
        }
    };
}

async function loadReleasePullRequestConfig(
    dependencies: Pick<ReleasePullRequestHandlerDependencies, 'configLoader' | 'workingDirectory'>
): Promise<LoadedReleasePullRequestConfig> {
    return parseReleasePullRequestConfig(dependencies, await dependencies.configLoader.load());
}

function hasChangedPackages(planned: PlannedRelease): boolean {
    return planned.packages.some(function (packagePlan) {
        return packagePlan.changed;
    });
}

function toPreparedReleaseFile(
    workingDirectory: string,
    file: WrittenReleaseChangelogFile
): PreparedReleaseFile {
    return {
        contentBase64: Buffer.from(file.content).toString('base64'),
        path: releaseCommitFilePath(workingDirectory, file.filePath)
    };
}

async function closeReleaseState(
    client: ReleasePullRequestGitHubClient,
    config: ReleasePullRequestConfig
): Promise<void> {
    await client.closeOpenReleasePullRequests({ baseBranch: config.defaultBranch, releaseBranch: config.branch });
    await client.deleteBranch(config.branch);
}

async function prepareReleasePullRequest(
    dependencies: ReleasePullRequestHandlerDependencies,
    client: ReleasePullRequestGitHubClient,
    config: ReleasePullRequestConfig
): Promise<PreparedReleaseCommit | undefined> {
    const baseHead = await client.getBranchHeadSha(config.defaultBranch);
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
    config: ReleasePullRequestConfig,
    releaseCommit: PreparedReleaseCommit
): Promise<number> {
    const releaseHead = await client.createCommitOnBranch({
        additions: releaseCommit.files.map(function (file) {
            return { contents: file.contentBase64, path: file.path };
        }),
        branch: config.branch,
        expectedHeadOid: releaseCommit.baseHead,
        message: config.commitSubject
    });
    const pullRequestNumber = await client.createOrUpdateReleasePullRequest({
        baseBranch: config.defaultBranch,
        body: config.body,
        label: config.label,
        releaseBranch: config.branch,
        title: config.title
    });
    const ciSucceeded = await runConfiguredGitHubActionsCi({
        client,
        config,
        headSha: releaseHead,
        sleep: dependencies.sleep
    });
    dependencies.log(`Release PR #${pullRequestNumber} points at ${releaseHead}`);
    return ciSucceeded ? 0 : 1;
}

async function finishReleasePullRequestMaintenance(
    dependencies: ReleasePullRequestHandlerDependencies,
    client: ReleasePullRequestGitHubClient,
    config: ReleasePullRequestConfig,
    releaseCommit: PreparedReleaseCommit | undefined
): Promise<number> {
    if (releaseCommit === undefined) {
        await closeReleaseState(client, config);
        dependencies.log('No release content remains');
        return 0;
    }
    return updateReleasePullRequest(dependencies, client, config, releaseCommit);
}

type MaintainReleasePullRequestHandlerDependencies = ReleasePullRequestHandlerDependencies & {
    readonly flags: Extract<ReleasePullRequestFlags, { readonly command: 'maintain'; }>;
};

async function runMaintain(dependencies: MaintainReleasePullRequestHandlerDependencies): Promise<number> {
    if (!dependencies.flags.noDryRun) {
        dependencies.log('Release PR writes require --no-dry-run');
        return 1;
    }
    const loadedConfig = await loadReleasePullRequestConfig(dependencies);
    const { client } = await createGitHubClient(dependencies);
    const releaseCommit = await prepareReleasePullRequest(dependencies, client, loadedConfig.config);
    return finishReleasePullRequestMaintenance(dependencies, client, loadedConfig.config, releaseCommit);
}

function readRequiredEnvironmentVariable(dependencies: ReleasePullRequestHandlerDependencies, name: string): string {
    const value = dependencies.readEnvironmentVariable(name);
    if (value === undefined || value.length === 0) {
        throw new Error(`${name} must be set`);
    }
    return value;
}

function parseJsonString(content: string): unknown {
    return JSON.parse(content) as unknown;
}

async function readGitHubEvent(dependencies: ReleasePullRequestHandlerDependencies): Promise<GitHubEvent> {
    const eventPath = readRequiredEnvironmentVariable(dependencies, 'GITHUB_EVENT_PATH');
    const parsedEvent = parseJsonString(await dependencies.fileManager.readFile(eventPath));
    if (!isGitHubEvent(parsedEvent)) {
        throw new Error('GitHub event payload must be an object');
    }
    return parsedEvent;
}

async function toPolicyInput(
    client: ReleasePullRequestGitHubClient,
    expectedBaseSha: string,
    pullRequestNumber: number
): Promise<ReleasePullRequestPolicyInput> {
    const pullRequest = await client.getPullRequestHead(pullRequestNumber);
    return {
        author: pullRequest.author,
        changedFiles: pullRequest.changedFiles,
        expectedBaseSha,
        headRef: pullRequest.headRef,
        labels: pullRequest.labels,
        parentShas: pullRequest.parentShas,
        subject: pullRequest.subject,
        title: pullRequest.title
    };
}

async function runPullRequestValidation(
    client: ReleasePullRequestGitHubClient,
    config: LoadedReleasePullRequestConfig,
    event: GitHubEvent
): Promise<void> {
    const pullRequestNumber = event.pull_request?.number;
    if (pullRequestNumber === undefined) {
        throw new Error('GitHub pull_request event payload is missing pull_request.number');
    }
    const expectedBaseSha = await client.getBranchHeadSha(config.config.defaultBranch);
    const policyInput = await toPolicyInput(client, expectedBaseSha, pullRequestNumber);
    if (policyInput.labels.includes(config.config.label)) {
        validateReleasePullRequestPolicy(policyInput, config.policyConfig);
    }
}

async function runMergeGroupValidation(
    client: ReleasePullRequestGitHubClient,
    config: LoadedReleasePullRequestConfig,
    event: GitHubEvent
): Promise<void> {
    const headSha = event.merge_group?.head_sha;
    const expectedBaseSha = event.merge_group?.base_sha;
    if (headSha === undefined || expectedBaseSha === undefined) {
        throw new Error('GitHub merge_group event payload is missing merge group SHAs');
    }
    const pullRequests = await client.listCommitPullRequests(headSha);
    const policyInputs = await Promise.all(
        pullRequests.map(async function (pullRequest) {
            return toPolicyInput(client, expectedBaseSha, pullRequest.number);
        })
    );
    validateReleaseMergeGroupPolicy({ pullRequests: policyInputs }, config.policyConfig);
}

async function validateGitHubEvent(
    client: ReleasePullRequestGitHubClient,
    config: LoadedReleasePullRequestConfig,
    event: GitHubEvent,
    eventName: string
): Promise<void> {
    if (eventName === 'pull_request') {
        await runPullRequestValidation(client, config, event);
        return;
    }
    if (eventName === 'merge_group') {
        await runMergeGroupValidation(client, config, event);
        return;
    }
    throw new Error('release-pr validate only supports pull_request and merge_group events');
}

async function runValidate(dependencies: ReleasePullRequestHandlerDependencies): Promise<number> {
    const loadedConfig = await loadReleasePullRequestConfig(dependencies);
    const { client } = await createGitHubClient(dependencies);
    const eventName = readRequiredEnvironmentVariable(dependencies, 'GITHUB_EVENT_NAME');
    const event = await readGitHubEvent(dependencies);
    await validateGitHubEvent(client, loadedConfig, event, eventName);
    dependencies.log('Release PR policy passed.');
    return 0;
}

function formatAuthorizationOutput(authorization: ReleasePublishAuthorization): readonly string[] {
    if (!authorization.shouldPublish) {
        return [ 'should_publish=false' ];
    }
    return [
        'should_publish=true',
        `publish_commit_sha=${authorization.publishCommitSha}`,
        `release_commit_sha=${authorization.releaseCommitSha}`,
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
    config: LoadedReleasePullRequestConfig,
    dependencies: ReleasePullRequestHandlerDependencies,
    github: GitHubContext,
    releasePullRequestNumber: string
): Promise<ReleasePublishAuthorization> {
    const refName = readRequiredEnvironmentVariable(dependencies, 'GITHUB_REF_NAME');
    if (refName !== config.config.defaultBranch) {
        throw new Error(`Manual release publish retries must run from ${config.config.defaultBranch}`);
    }
    return authorizeReleasePublishFromPullRequest({
        config: config.policyConfig,
        pullRequest: await github.client.getPullRequest(Number(releasePullRequestNumber)),
        repository: github.repository
    });
}

async function authorizePushPublish(
    config: LoadedReleasePullRequestConfig,
    dependencies: ReleasePullRequestHandlerDependencies,
    github: GitHubContext
): Promise<ReleasePublishAuthorization> {
    const commitSha = readRequiredEnvironmentVariable(dependencies, 'GITHUB_SHA');
    return authorizeReleasePublishFromCommit({
        commitSha,
        config: config.policyConfig,
        pullRequests: await github.client.listCommitPullRequests(commitSha),
        repository: github.repository
    });
}

async function authorizePublish(
    config: LoadedReleasePullRequestConfig,
    dependencies: ReleasePullRequestHandlerDependencies,
    github: GitHubContext
): Promise<ReleasePublishAuthorization> {
    const { releasePullRequestNumber } = dependencies.flags;
    if (releasePullRequestNumber !== undefined) {
        return authorizeManualPublish(config, dependencies, github, releasePullRequestNumber);
    }
    return authorizePushPublish(config, dependencies, github);
}

async function runAuthorizePublish(dependencies: ReleasePullRequestHandlerDependencies): Promise<number> {
    const config = await loadReleasePullRequestConfig(dependencies);
    const github = await createGitHubClient(dependencies);
    await writeAuthorizationOutput(dependencies, await authorizePublish(config, dependencies, github));
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
        dependencies.log(formatHandlerError(error));
        return stopSpinnersAndReturn(dependencies, 1);
    }
}
