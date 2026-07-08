import assert from 'node:assert';
import { stripVTControlCharacters } from 'node:util';
import { fake, type SinonSpy } from 'sinon';
import { Result } from 'true-myth';
import { createProgressBroadcaster, type ProgressBroadcaster } from '../progress/progress-broadcaster.ts';
import {
    createCommandLineInterfaceRunner,
    type CommandLineInterfaceRunner,
    type CommandLineInterfaceRunnerDependencies
} from '../command-line-interface/runner/runner.ts';
import { createBuildReportFixture } from './preview-fixtures.ts';
import { createFakeFileManager, type FakeFileManager } from './fake-file-manager.ts';
import { toOutcome, toReleaseAnalysisOutcome, toReleaseDiffOutcome } from './result-helpers.ts';

export const noPublicationOutcome = { type: 'none' } as const;
type ReleasePullRequestGitHubClientFixture = ReturnType<
    CommandLineInterfaceRunnerDependencies['createReleasePullRequestGitHubClient']
>;
type ReleaseGitClientFixture = CommandLineInterfaceRunnerDependencies['releaseGitClient'];
type RunPreviewOverrides = {
    readonly pageOutput?: SinonSpy;
    readonly log?: SinonSpy;
};
type RunPreviewResult = {
    readonly exitCode: number;
    readonly pageOutput: SinonSpy;
    readonly log: SinonSpy;
};

export type Overrides = {
    readonly buildAndPublishAll?: SinonSpy;
    readonly diffAgainstLatestPublished?: SinonSpy;
    readonly planReleaseAgainstLatestPublished?: SinonSpy;
    readonly packPackage?: SinonSpy;
    readonly loadConfig?: SinonSpy;
    readonly log?: SinonSpy;
    readonly fileManager?: FakeFileManager;
    readonly pageOutput?: SinonSpy;
    readonly openFile?: SinonSpy;
    readonly createTemporaryFilePath?: () => string;
    readonly createPrLogEngine?: SinonSpy;
    readonly createGitHubReleaseClient?: SinonSpy;
    readonly createReleasePullRequestGitHubClient?: SinonSpy;
    readonly readEnvironmentVariable?: (name: string) => string | undefined;
    readonly readPackageInfo?: () => Promise<Readonly<Record<string, unknown>>>;
    readonly releaseGitClient?: CommandLineInterfaceRunnerDependencies['releaseGitClient'];
    readonly progressBroadcaster?: ProgressBroadcaster;
    readonly spinnerRenderer?: {
        readonly add?: SinonSpy;
        readonly stop?: SinonSpy;
        readonly updateMessage?: SinonSpy;
        readonly stopAll?: SinonSpy;
    };
};

function createSpinnerRenderer(
    overrides: Overrides['spinnerRenderer'] = {}
): CommandLineInterfaceRunnerDependencies['spinnerRenderer'] {
    const add = overrides.add ?? fake();
    const stop = overrides.stop ?? fake();
    const updateMessage = overrides.updateMessage ?? fake();
    const stopAll = overrides.stopAll ?? fake();

    return {
        add(...args) {
            add(...args);
        },
        stop(...args) {
            stop(...args);
        },
        updateMessage(...args) {
            updateMessage(...args);
        },
        stopAll() {
            stopAll();
        }
    };
}

function createPrLogEngineFactory(overrides: Overrides): CommandLineInterfaceRunnerDependencies['createPrLogEngine'] {
    return overrides.createPrLogEngine ?? fake.returns({
        resolveLatestSemverChangelogBaseRef: fake.resolves({ ref: 'latest-semver' }),
        resolveChangelogBaseRef: fake.resolves({ ref: 'previous-ref' }),
        collectMergedPullRequests: fake.resolves([]),
        readPullRequestChangedFiles: fake.resolves(new Map()),
        readPullRequestLabels: fake.resolves(new Map()),
        filterPullRequestsByTargetFiles: fake.returns([]),
        resolvePullRequestLabels: fake.resolves([]),
        resolveVersionNumber: fake.returns('1.0.1'),
        renderChangelog: fake.returns(''),
        renderGroupedTargetChangelog: fake.returns(''),
        renderTargetChangelog: fake.returns(''),
        updateChangelog: fake.returns('')
    });
}

function createGitHubReleaseClientFactory(
    overrides: Overrides
): CommandLineInterfaceRunnerDependencies['createGitHubReleaseClient'] {
    return overrides.createGitHubReleaseClient ?? fake.returns({
        createReleaseIfMissing: fake.resolves('created')
    });
}

function createReleasePullRequestClientFixture(
    overrides: Readonly<Partial<ReleasePullRequestGitHubClientFixture>>
): ReleasePullRequestGitHubClientFixture {
    return {
        closeOpenReleasePullRequests: fake.resolves(undefined),
        createCommitOnBranch: fake.resolves('signed-release-head'),
        createOrUpdateReleasePullRequest: fake.resolves(1),
        createStatus: fake.resolves(undefined),
        deleteActionRequiredPullRequestRuns: fake.resolves(undefined),
        dispatchWorkflow: fake.resolves(undefined),
        findDispatchedWorkflowRun: fake.resolves({
            event: 'workflow_dispatch',
            observedRunIds: [],
            runId: undefined
        }),
        getBranchHeadSha: fake.resolves('main-head'),
        getPullRequest: fake.resolves(undefined as never),
        getPullRequestHead: fake.resolves(undefined as never),
        listCommitPullRequests: fake.resolves([]),
        readWorkflowRunResult: fake.resolves({
            conclusion: 'success',
            databaseId: 1,
            url: 'https://github.com/enormora/packtory/actions/runs/1',
            jobs: []
        }),
        ...overrides
    };
}

function createReleasePullRequestGitHubClientFactory(
    overrides: Overrides
): CommandLineInterfaceRunnerDependencies['createReleasePullRequestGitHubClient'] {
    return overrides.createReleasePullRequestGitHubClient ?? fake.returns(createReleasePullRequestClientFixture({}));
}

function createPacktoryFixture(overrides: Overrides): CommandLineInterfaceRunnerDependencies['packtory'] {
    return {
        analyzeReleaseAgainstLatestPublished: fake.resolves(
            toReleaseAnalysisOutcome(
                Result.ok({
                    classification: 'unchanged',
                    mostRecentPublishedAt: undefined,
                    packageAnalyses: []
                })
            )
        ),
        buildAndPublishAll: overrides.buildAndPublishAll ?? fake.resolves(undefined as never),
        diffAgainstLatestPublished: overrides.diffAgainstLatestPublished ??
            fake.resolves(toReleaseDiffOutcome(Result.ok([]))),
        planReleaseAgainstLatestPublished: overrides.planReleaseAgainstLatestPublished ??
            fake.resolves({
                result: Result.ok({ packages: [] }),
                getReport() {
                    return createBuildReportFixture();
                }
            }),
        resolveAndLinkAll: fake.resolves(toOutcome(Result.ok([]))),
        packPackage: overrides.packPackage ?? fake.resolves(toOutcome(Result.ok(undefined)))
    };
}

function createProgressConsumer(overrides: Overrides): CommandLineInterfaceRunnerDependencies['progressBroadcaster'] {
    return (overrides.progressBroadcaster ?? createProgressBroadcaster()).consumer;
}

function createPageOutputSpy(overrides: Overrides): SinonSpy {
    return overrides.pageOutput ?? fake.resolves(undefined);
}

function createTemporaryFilePath(overrides: Overrides): () => string {
    return overrides.createTemporaryFilePath ??
        function () {
            return '/workspace/packtory-preview.html';
        };
}

function readEnvironmentVariable(overrides: Overrides): (name: string) => string | undefined {
    return overrides.readEnvironmentVariable ??
        function (name) {
            return name === 'GH_TOKEN' ? 'gh-token' : undefined;
        };
}

function readPackageInfo(overrides: Overrides): () => Promise<Readonly<Record<string, unknown>>> {
    return overrides.readPackageInfo ??
        async function () {
            return { repository: { url: 'https://github.com/enormora/packtory' } };
        };
}

export function createReleaseGitClientFixture(
    overrides: Readonly<Partial<ReleaseGitClientFixture>> = {}
): ReleaseGitClientFixture {
    return {
        commit: fake.resolves(undefined),
        currentHead: fake.resolves('new-head'),
        deleteRemoteBranch: fake.resolves(undefined),
        ensureClean: fake.resolves(undefined),
        ensureTag: fake.resolves(undefined),
        pushHeadToBranch: fake.resolves(undefined),
        pushFollowTags: fake.resolves(undefined),
        readChangedFiles: fake.resolves([]),
        ...overrides
    };
}

function createReleaseGitClient(overrides: Overrides): CommandLineInterfaceRunnerDependencies['releaseGitClient'] {
    return overrides.releaseGitClient ?? createReleaseGitClientFixture();
}

function createRunnerDependencies(overrides: Overrides): CommandLineInterfaceRunnerDependencies {
    const log = overrides.log ?? fake();
    const pageOutput = createPageOutputSpy(overrides);
    return {
        createPrLogEngine: createPrLogEngineFactory(overrides),
        createGitHubReleaseClient: createGitHubReleaseClientFactory(overrides),
        createReleasePullRequestGitHubClient: createReleasePullRequestGitHubClientFactory(overrides),
        currentDate() {
            return new Date('2026-06-13T00:00:00.000Z');
        },
        packtory: createPacktoryFixture(overrides),
        log(message) {
            log(stripVTControlCharacters(message));
        },
        configLoader: {
            load: overrides.loadConfig ?? fake.resolves(undefined)
        },
        progressBroadcaster: createProgressConsumer(overrides),
        spinnerRenderer: createSpinnerRenderer(overrides.spinnerRenderer),
        fileManager: overrides.fileManager ?? createFakeFileManager(),
        async pageOutput(message) {
            pageOutput(stripVTControlCharacters(message));
        },
        openFile: overrides.openFile ?? fake.resolves(true),
        createTemporaryFilePath: createTemporaryFilePath(overrides),
        readEnvironmentVariable: readEnvironmentVariable(overrides),
        readPackageInfo: readPackageInfo(overrides),
        releaseGitClient: createReleaseGitClient(overrides),
        sleep: fake.resolves(undefined),
        workingDirectory: '/workspace'
    };
}

export function createRunner(overrides: Overrides = {}): CommandLineInterfaceRunner {
    return createCommandLineInterfaceRunner(createRunnerDependencies(overrides));
}

export async function expectCommandLoadsConfig(command: 'preview' | 'publish'): Promise<void> {
    const loadConfig = fake.resolves('the-config');
    const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
    const runner = createRunner({ loadConfig, buildAndPublishAll });

    await runner.run([ 'foo', 'bar', command ]);

    assert.strictEqual(loadConfig.callCount, 1);
    assert.strictEqual(buildAndPublishAll.callCount, 1);
    assert.strictEqual(buildAndPublishAll.firstCall.args[0], 'the-config');
}

export async function expectHelp(args: readonly string[]): Promise<string> {
    const log = fake();
    const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
    const runner = createRunner({ buildAndPublishAll, log });

    const exitCode = await runner.run([ 'foo', 'bar', ...args ]);

    assert.strictEqual(exitCode, 0);
    return String(log.firstCall.args[0]);
}

export async function expectSubcommandHelp(command: 'preview' | 'publish' | 'release'): Promise<string> {
    return expectHelp([ command, '--help' ]);
}

export function createReleasePullRequestConfig(): Readonly<Record<string, unknown>> {
    return {
        changelog: { outputs: [ { kind: 'repository-file', path: 'CHANGELOG.md' } ] },
        packages: [
            {
                sourcesFolder: 'src',
                mainPackageJson: { type: 'module' },
                name: 'pkg',
                roots: { main: { js: 'index.js' } },
                publishSettings: { access: 'public' }
            }
        ]
    };
}

export const createReleasePullRequestClient = createReleasePullRequestClientFixture;

export async function expectCollectReportFlag(flag: '--report-html' | '--report-json'): Promise<void> {
    const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
    const runner = createRunner({ buildAndPublishAll });

    await runner.run([ 'foo', 'bar', 'publish', flag ]);

    assert.deepStrictEqual(buildAndPublishAll.firstCall.args[1], { dryRun: true, stage: false, collectReport: true });
}

export async function runPreview(
    buildAndPublishAll: SinonSpy,
    overrides: RunPreviewOverrides = {}
): Promise<RunPreviewResult> {
    const pageOutput = overrides.pageOutput ?? fake.resolves(undefined);
    const log = overrides.log ?? fake();
    const runner = createRunner({ buildAndPublishAll, pageOutput, log });

    const exitCode = await runner.run([ 'foo', 'bar', 'preview' ]);

    return { exitCode, pageOutput, log };
}
