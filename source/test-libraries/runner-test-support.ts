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
type GitHubReleaseClientFixture = ReturnType<CommandLineInterfaceRunnerDependencies['createGitHubReleaseClient']>;
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
    readonly analyzeReleaseAgainstLatestPublished?: SinonSpy;
    readonly buildAndPublishAll?: SinonSpy;
    readonly diffAgainstLatestPublished?: SinonSpy;
    readonly inspectPackageDependencies?: SinonSpy;
    readonly inspectPackageFiles?: SinonSpy;
    readonly inspectPackageSideEffects?: SinonSpy;
    readonly inspectPackageTree?: SinonSpy;
    readonly planReleaseAgainstLatestPublished?: SinonSpy;
    readonly packAllPackages?: SinonSpy;
    readonly packPackage?: SinonSpy;
    readonly loadConfiguration?: SinonSpy;
    readonly log?: SinonSpy;
    readonly fileManager?: FakeFileManager;
    readonly pageOutput?: SinonSpy;
    readonly openFile?: SinonSpy;
    readonly createTemporaryFilePath?: () => string;
    readonly createPullRequestLogEngine?: SinonSpy;
    readonly createGitHubReleaseClient?: SinonSpy;
    readonly createReleasePullRequestGitHubClient?: SinonSpy;
    readonly readEnvironmentVariable?: (name: string) => string | undefined;
    readonly readPackageInformation?: () => Promise<Readonly<Record<string, unknown>>>;
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
        add(...commandArguments) {
            add(...commandArguments);
        },
        stop(...commandArguments) {
            stop(...commandArguments);
        },
        updateMessage(...commandArguments) {
            updateMessage(...commandArguments);
        },
        stopAll() {
            stopAll();
        }
    };
}

function createPullRequestLogEngineFactory(
    overrides: Overrides
): CommandLineInterfaceRunnerDependencies['createPullRequestLogEngine'] {
    return overrides.createPullRequestLogEngine ?? fake.returns({
        resolveLatestSemverChangelogBaseReference: fake.resolves({ reference: 'latest-semver' }),
        resolveChangelogBaseReference: fake.resolves({ reference: 'previous-ref' }),
        collectMergedPullRequests: fake.resolves([]),
        readPullRequestChangedFiles: fake.resolves(new Map()),
        readPullRequestLabels: fake.resolves(new Map()),
        filterPullRequestsByTargetFiles: fake.returns([]),
        resolvePullRequestLabels: fake.resolves([]),
        resolveVersionNumber: fake.returns('1.0.1'),
        extractChangelogReleaseSection: fake(function (): never {
            throw new Error('unexpected changelog section extraction');
        }),
        renderChangelog: fake.returns(''),
        renderGroupedTargetChangelog: fake.returns(''),
        renderTargetChangelog: fake.returns(''),
        updateChangelog: fake.returns('')
    });
}

function createReleasePullRequestClientFixture(
    overrides: Readonly<Partial<ReleasePullRequestGitHubClientFixture>>
): ReleasePullRequestGitHubClientFixture {
    let workflowRunLookupCount = 0;
    return {
        cancelActiveDispatchedWorkflowRuns: fake.resolves([]),
        closeOpenReleasePullRequests: fake.resolves(undefined),
        createCommitOnBranch: fake.resolves('signed-release-head'),
        createOrUpdateReleasePullRequest: fake.resolves(1),
        createStatus: fake.resolves(undefined),
        deleteActionRequiredPullRequestRuns: fake.resolves([]),
        deleteBranch: fake.resolves(undefined),
        dispatchWorkflow: fake.resolves(undefined),
        findDispatchedWorkflowRun: fake(async function () {
            workflowRunLookupCount += 1;
            return workflowRunLookupCount === 1
                ? { event: 'workflow_dispatch' as const, observedRunIdentifiers: [], runIdentifier: undefined }
                : { event: 'workflow_dispatch' as const, observedRunIdentifiers: [ 1 ], runIdentifier: 1 };
        }),
        getBranchHeadHash: fake.resolves('main-head'),
        getPullRequest: fake.resolves(undefined as never),
        getPullRequestHead: fake.resolves(undefined as never),
        listCommitPullRequests: fake.resolves([]),
        readWorkflowRunResult: fake.resolves({
            conclusion: 'success',
            databaseIdentifier: 1,
            address: 'https://github.com/enormora/packtory/actions/runs/1',
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

function createInspectPackageTreeFixture(overrides: Overrides): SinonSpy {
    return overrides.inspectPackageTree ??
        fake.resolves({ result: Result.ok({ packageName: 'package-a', entries: [] }) });
}

function createInspectPackageDependenciesFixture(overrides: Overrides): SinonSpy {
    return overrides.inspectPackageDependencies ??
        fake.resolves({ result: Result.ok({ packageName: 'package-a', dependencies: [] }) });
}

function createInspectPackageFilesFixture(overrides: Overrides): SinonSpy {
    return overrides.inspectPackageFiles ??
        fake.resolves({ result: Result.ok({ packageName: 'package-a', files: [] }) });
}

function createInspectPackageSideEffectsFixture(overrides: Overrides): SinonSpy {
    return overrides.inspectPackageSideEffects ??
        fake.resolves({
            result: Result.ok({
                packageName: 'package-a',
                packageManifestDecision: { type: 'side-effects-false' },
                impureFiles: []
            })
        });
}

export function createGitHubReleaseClientFixture(
    overrides: Readonly<Partial<GitHubReleaseClientFixture>>
): GitHubReleaseClientFixture {
    return {
        createReleaseIfMissing: fake.resolves('created'),
        ensureAnnotatedTag: fake.resolves('created'),
        ...overrides
    };
}

function createGitHubReleaseClientFactory(
    overrides: Overrides
): CommandLineInterfaceRunnerDependencies['createGitHubReleaseClient'] {
    return overrides.createGitHubReleaseClient ?? fake.returns(createGitHubReleaseClientFixture({}));
}

function createPackAllPackagesFixture(overrides: Overrides): SinonSpy {
    return overrides.packAllPackages ?? fake.resolves({ result: Result.ok({ packageNames: [] }) });
}

function createPacktoryFixture(overrides: Overrides): CommandLineInterfaceRunnerDependencies['packtory'] {
    return {
        analyzeReleaseAgainstLatestPublished: overrides.analyzeReleaseAgainstLatestPublished ?? fake.resolves(
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
        inspectPackageDependencies: createInspectPackageDependenciesFixture(overrides),
        inspectPackageFiles: createInspectPackageFilesFixture(overrides),
        inspectPackageSideEffects: createInspectPackageSideEffectsFixture(overrides),
        inspectPackageTree: createInspectPackageTreeFixture(overrides),
        planReleaseAgainstLatestPublished: overrides.planReleaseAgainstLatestPublished ??
            fake.resolves({
                result: Result.ok({ packages: [] }),
                getReport() {
                    return createBuildReportFixture();
                }
            }),
        resolveAndLinkAll: fake.resolves(toOutcome(Result.ok([]))),
        packAllPackages: createPackAllPackagesFixture(overrides),
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

function readPackageInformation(overrides: Overrides): () => Promise<Readonly<Record<string, unknown>>> {
    return overrides.readPackageInformation ??
        async function () {
            return { repository: { url: 'https://github.com/enormora/packtory' } };
        };
}

function createRunnerDependencies(overrides: Overrides): CommandLineInterfaceRunnerDependencies {
    const log = overrides.log ?? fake();
    const pageOutput = createPageOutputSpy(overrides);
    return {
        createPullRequestLogEngine: createPullRequestLogEngineFactory(overrides),
        createGitHubReleaseClient: createGitHubReleaseClientFactory(overrides),
        createReleasePullRequestGitHubClient: createReleasePullRequestGitHubClientFactory(overrides),
        currentDate() {
            return new Date('2026-06-13T00:00:00.000Z');
        },
        packtory: createPacktoryFixture(overrides),
        log(message) {
            log(stripVTControlCharacters(message));
        },
        configurationLoader: {
            load: overrides.loadConfiguration ?? fake.resolves(undefined)
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
        readPackageInformation: readPackageInformation(overrides),
        sleep: fake.resolves(undefined),
        workingDirectory: '/workspace'
    };
}

export function createRunner(overrides: Overrides = {}): CommandLineInterfaceRunner {
    return createCommandLineInterfaceRunner(createRunnerDependencies(overrides));
}

export async function expectCommandLoadsConfiguration(command: 'preview' | 'publish'): Promise<void> {
    const loadConfiguration = fake.resolves('the-config');
    const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
    const runner = createRunner({ loadConfiguration, buildAndPublishAll });

    await runner.run([ 'foo', 'bar', command ]);

    assert.strictEqual(loadConfiguration.callCount, 1);
    assert.strictEqual(buildAndPublishAll.callCount, 1);
    assert.strictEqual(buildAndPublishAll.firstCall.args[0], 'the-config');
}

export async function expectHelp(commandArguments: readonly string[]): Promise<string> {
    const log = fake();
    const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
    const runner = createRunner({ buildAndPublishAll, log });

    const exitCode = await runner.run([ 'foo', 'bar', ...commandArguments ]);

    assert.strictEqual(exitCode, 0);
    return String(log.firstCall.args[0]);
}

export async function expectSubcommandHelp(...commandPath: readonly string[]): Promise<string> {
    return expectHelp([ ...commandPath, '--help' ]);
}

export function createReleasePullRequestConfiguration(): Readonly<Record<string, unknown>> {
    return {
        changelog: { outputs: [ { kind: 'repository-file', path: 'CHANGELOG.md' } ] },
        packages: [
            {
                sourcesFolder: 'source',
                mainPackageManifest: { type: 'module' },
                name: 'package',
                roots: { main: { javaScript: 'index.js' } },
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
