import { parseValidConfig } from './changelog-destinations.ts';
import { formatGitHubRepositoryName, parseGitHubRepositoryParts } from './github-repository.ts';
import type { ReleaseGitClient } from './release-git-client.ts';
import { runReleaseHandler } from './release-handler.ts';
import {
    authorizeReleasePublishFromCommit,
    authorizeReleasePublishFromPullRequest,
    type ReleasePublishAuthorization
} from './release-publish-authorization.ts';
import { collectReleaseOutputFiles } from './release-output-files.ts';
import { runConfiguredGitHubActionsCi } from './release-pull-request-ci.ts';
import {
    parseReleasePullRequestConfigContainer,
    resolveReleasePullRequestConfig,
    type ReleasePullRequestConfig
} from './release-pull-request-config.ts';
import type { ReleasePullRequestGitHubClient } from './release-pr-github-client.ts';
import {
    validateReleaseMergeGroupPolicy,
    validateReleasePullRequestPolicy,
    type ReleasePullRequestPolicyConfig,
    type ReleasePullRequestPolicyInput
} from './release-pull-request-policy.ts';

type Logger = (message: string) => void;
type EnvironmentReader = (name: string) => string | undefined;
type ReleaseHandlerDependencies = Parameters<typeof runReleaseHandler>[0];

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

type ReleasePullRequestFlags =
    | AuthorizePublishReleasePullRequestFlags
    | MaintainReleasePullRequestFlags
    | ValidateReleasePullRequestFlags;

export type ReleasePullRequestHandlerDependencies = {
    readonly createGitHubReleaseClient: ReleaseHandlerDependencies['createGitHubReleaseClient'];
    readonly createPrLogEngine: ReleaseHandlerDependencies['createPrLogEngine'];
    readonly createReleasePullRequestGitHubClient: (context: {
        readonly owner: string;
        readonly repo: string;
        readonly token: string;
    }) => ReleasePullRequestGitHubClient;
    readonly currentDate: () => Date;
    readonly fileManager: {
        readonly readFile: (filePath: string) => Promise<string>;
        readonly writeFile: (filePath: string, content: string) => Promise<void>;
    };
    readonly flags: ReleasePullRequestFlags;
    readonly gitClient: ReleaseGitClient;
    readonly log: Logger;
    readonly packtory: ReleaseHandlerDependencies['packtory'];
    readonly readEnvironmentVariable: EnvironmentReader;
    readonly readPackageInfo: () => Promise<Record<string, unknown>>;
    readonly sleep: (milliseconds: number) => Promise<void>;
    readonly spinnerRenderer: { readonly stopAll: () => void };
    readonly configLoader: { readonly load: () => Promise<unknown> };
    readonly workingDirectory: string;
};

type LoadedReleasePullRequestConfig = {
    readonly config: ReleasePullRequestConfig;
    readonly policyConfig: ReleasePullRequestPolicyConfig;
};
type PreparedReleaseCommit = {
    readonly baseHead: string;
    readonly localHead: string;
};

type GitHubEvent = {
    readonly merge_group?: { readonly base_sha?: string | undefined; readonly head_sha?: string | undefined };
    readonly pull_request?: { readonly number?: number | undefined };
};
type GitHubContext = {
    readonly client: ReleasePullRequestGitHubClient;
    readonly repository: string;
};

function formatHandlerError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function readGitHubToken(dependencies: Pick<ReleasePullRequestHandlerDependencies, 'readEnvironmentVariable'>): string {
    const token =
        dependencies.readEnvironmentVariable('GH_TOKEN') ?? dependencies.readEnvironmentVariable('GITHUB_TOKEN');
    if (token === undefined) {
        throw new Error('GH_TOKEN or GITHUB_TOKEN must be set');
    }
    return token;
}

function parseGitHubRepositoryName(repositoryName: string): { readonly owner: string; readonly repo: string } {
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
): Promise<{ readonly name: string; readonly owner: string; readonly repo: string }> {
    const repositoryName = dependencies.readEnvironmentVariable('GITHUB_REPOSITORY');
    if (repositoryName !== undefined) {
        const { owner, repo } = parseGitHubRepositoryName(repositoryName);
        return { name: repositoryName, owner, repo };
    }
    const packageInfo = await dependencies.readPackageInfo();
    const repository = parseGitHubRepositoryParts(packageInfo);
    return { ...repository, name: formatGitHubRepositoryName(packageInfo) };
}

async function createGitHubClient(dependencies: ReleasePullRequestHandlerDependencies): Promise<{
    readonly client: ReleasePullRequestGitHubClient;
    readonly repository: string;
}> {
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

async function runPrepareRelease(dependencies: ReleasePullRequestHandlerDependencies): Promise<number> {
    return runReleaseHandler({
        createGitHubReleaseClient: dependencies.createGitHubReleaseClient,
        createPrLogEngine: dependencies.createPrLogEngine,
        currentDate: dependencies.currentDate,
        fileManager: dependencies.fileManager,
        flags: {
            commit: true,
            githubRelease: false,
            noDryRun: true,
            publish: false,
            push: false,
            tag: false,
            writeChangelog: true
        },
        gitClient: dependencies.gitClient,
        log: dependencies.log,
        packtory: dependencies.packtory,
        readEnvironmentVariable: dependencies.readEnvironmentVariable,
        readPackageInfo: dependencies.readPackageInfo,
        spinnerRenderer: dependencies.spinnerRenderer,
        configLoader: dependencies.configLoader,
        workingDirectory: dependencies.workingDirectory
    });
}

async function closeReleaseState(
    dependencies: ReleasePullRequestHandlerDependencies,
    client: ReleasePullRequestGitHubClient,
    config: ReleasePullRequestConfig
): Promise<void> {
    await client.closeOpenReleasePullRequests({ baseBranch: config.defaultBranch, releaseBranch: config.branch });
    await dependencies.gitClient.deleteRemoteBranch(config.branch);
}

async function prepareReleasePullRequest(
    dependencies: ReleasePullRequestHandlerDependencies
): Promise<PreparedReleaseCommit | undefined> {
    const originalHead = await dependencies.gitClient.currentHead();
    const releaseExitCode = await runPrepareRelease(dependencies);
    if (releaseExitCode !== 0) {
        throw new Error('Release preparation failed');
    }
    const releaseHead = await dependencies.gitClient.currentHead();
    return releaseHead === originalHead ? undefined : { baseHead: originalHead, localHead: releaseHead };
}

async function updateReleasePullRequest(
    dependencies: ReleasePullRequestHandlerDependencies,
    client: ReleasePullRequestGitHubClient,
    config: ReleasePullRequestConfig,
    releaseCommit: PreparedReleaseCommit
): Promise<number> {
    const releaseFiles = await dependencies.gitClient.readChangedFiles(releaseCommit.baseHead, releaseCommit.localHead);
    const releaseHead = await client.createCommitOnBranch({
        additions: releaseFiles.map((file) => {
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
        await closeReleaseState(dependencies, client, config);
        dependencies.log('No release content remains');
        return 0;
    }
    return updateReleasePullRequest(dependencies, client, config, releaseCommit);
}

type MaintainReleasePullRequestHandlerDependencies = ReleasePullRequestHandlerDependencies & {
    readonly flags: Extract<ReleasePullRequestFlags, { readonly command: 'maintain' }>;
};

async function runMaintain(dependencies: MaintainReleasePullRequestHandlerDependencies): Promise<number> {
    if (!dependencies.flags.noDryRun) {
        dependencies.log('Release PR writes require --no-dry-run');
        return 1;
    }
    const loadedConfig = await loadReleasePullRequestConfig(dependencies);
    const { client } = await createGitHubClient(dependencies);
    const releaseCommit = await prepareReleasePullRequest(dependencies);
    return finishReleasePullRequestMaintenance(dependencies, client, loadedConfig.config, releaseCommit);
}

function readRequiredEnvironmentVariable(dependencies: ReleasePullRequestHandlerDependencies, name: string): string {
    const value = dependencies.readEnvironmentVariable(name);
    if (value === undefined || value.length === 0) {
        throw new Error(`${name} must be set`);
    }
    return value;
}

async function readGitHubEvent(dependencies: ReleasePullRequestHandlerDependencies): Promise<GitHubEvent> {
    const eventPath = readRequiredEnvironmentVariable(dependencies, 'GITHUB_EVENT_PATH');
    const parsedEvent: unknown = JSON.parse(await dependencies.fileManager.readFile(eventPath));
    if (!isGitHubEvent(parsedEvent)) {
        throw new Error('GitHub event payload must be an object');
    }
    return parsedEvent;
}

async function toPolicyInput(input: {
    readonly client: ReleasePullRequestGitHubClient;
    readonly expectedBaseSha: string;
    readonly pullRequestNumber: number;
}): Promise<ReleasePullRequestPolicyInput> {
    const pullRequest = await input.client.getPullRequestHead(input.pullRequestNumber);
    return {
        author: pullRequest.author,
        changedFiles: pullRequest.changedFiles,
        expectedBaseSha: input.expectedBaseSha,
        headRef: pullRequest.headRef,
        labels: pullRequest.labels,
        parentShas: pullRequest.parentShas,
        subject: pullRequest.subject,
        title: pullRequest.title
    };
}

async function runPullRequestValidation(input: {
    readonly client: ReleasePullRequestGitHubClient;
    readonly config: LoadedReleasePullRequestConfig;
    readonly event: GitHubEvent;
}): Promise<void> {
    const pullRequestNumber = input.event.pull_request?.number;
    if (pullRequestNumber === undefined) {
        throw new Error('GitHub pull_request event payload is missing pull_request.number');
    }
    const expectedBaseSha = await input.client.getBranchHeadSha(input.config.config.defaultBranch);
    const policyInput = await toPolicyInput({ client: input.client, expectedBaseSha, pullRequestNumber });
    if (policyInput.labels.includes(input.config.config.label)) {
        validateReleasePullRequestPolicy(policyInput, input.config.policyConfig);
    }
}

async function runMergeGroupValidation(input: {
    readonly client: ReleasePullRequestGitHubClient;
    readonly config: LoadedReleasePullRequestConfig;
    readonly event: GitHubEvent;
}): Promise<void> {
    const headSha = input.event.merge_group?.head_sha;
    const expectedBaseSha = input.event.merge_group?.base_sha;
    if (headSha === undefined || expectedBaseSha === undefined) {
        throw new Error('GitHub merge_group event payload is missing merge group SHAs');
    }
    const pullRequests = await input.client.listCommitPullRequests(headSha);
    const policyInputs = await Promise.all(
        pullRequests.map(async (pullRequest) => {
            return toPolicyInput({ client: input.client, expectedBaseSha, pullRequestNumber: pullRequest.number });
        })
    );
    validateReleaseMergeGroupPolicy({ pullRequests: policyInputs }, input.config.policyConfig);
}

async function validateGitHubEvent(input: {
    readonly client: ReleasePullRequestGitHubClient;
    readonly config: LoadedReleasePullRequestConfig;
    readonly event: GitHubEvent;
    readonly eventName: string;
}): Promise<void> {
    if (input.eventName === 'pull_request') {
        await runPullRequestValidation(input);
        return;
    }
    if (input.eventName === 'merge_group') {
        await runMergeGroupValidation(input);
        return;
    }
    throw new Error('release-pr validate only supports pull_request and merge_group events');
}

async function runValidate(dependencies: ReleasePullRequestHandlerDependencies): Promise<number> {
    const loadedConfig = await loadReleasePullRequestConfig(dependencies);
    const { client } = await createGitHubClient(dependencies);
    const eventName = readRequiredEnvironmentVariable(dependencies, 'GITHUB_EVENT_NAME');
    const event = await readGitHubEvent(dependencies);
    await validateGitHubEvent({ client, config: loadedConfig, event, eventName });
    dependencies.log('Release PR policy passed.');
    return 0;
}

function formatAuthorizationOutput(authorization: ReleasePublishAuthorization): readonly string[] {
    if (!authorization.shouldPublish) {
        return ['should_publish=false'];
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
    input: {
        readonly config: LoadedReleasePullRequestConfig;
        readonly dependencies: ReleasePullRequestHandlerDependencies;
        readonly github: GitHubContext;
    },
    releasePullRequestNumber: string
): Promise<ReleasePublishAuthorization> {
    const refName = readRequiredEnvironmentVariable(input.dependencies, 'GITHUB_REF_NAME');
    if (refName !== input.config.config.defaultBranch) {
        throw new Error(`Manual release publish retries must run from ${input.config.config.defaultBranch}`);
    }
    return authorizeReleasePublishFromPullRequest({
        config: input.config.policyConfig,
        pullRequest: await input.github.client.getPullRequest(Number(releasePullRequestNumber)),
        repository: input.github.repository
    });
}

async function authorizePushPublish(input: {
    readonly config: LoadedReleasePullRequestConfig;
    readonly dependencies: ReleasePullRequestHandlerDependencies;
    readonly github: GitHubContext;
}): Promise<ReleasePublishAuthorization> {
    const commitSha = readRequiredEnvironmentVariable(input.dependencies, 'GITHUB_SHA');
    return authorizeReleasePublishFromCommit({
        commitSha,
        config: input.config.policyConfig,
        pullRequests: await input.github.client.listCommitPullRequests(commitSha),
        repository: input.github.repository
    });
}

async function authorizePublish(input: {
    readonly config: LoadedReleasePullRequestConfig;
    readonly dependencies: ReleasePullRequestHandlerDependencies;
    readonly github: GitHubContext;
}): Promise<ReleasePublishAuthorization> {
    const { releasePullRequestNumber } = input.dependencies.flags;
    if (releasePullRequestNumber !== undefined) {
        return authorizeManualPublish(input, releasePullRequestNumber);
    }
    return authorizePushPublish(input);
}

async function runAuthorizePublish(dependencies: ReleasePullRequestHandlerDependencies): Promise<number> {
    const config = await loadReleasePullRequestConfig(dependencies);
    const github = await createGitHubClient(dependencies);
    await writeAuthorizationOutput(dependencies, await authorizePublish({ config, dependencies, github }));
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
