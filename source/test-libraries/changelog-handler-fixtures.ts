import assert from 'node:assert';
import { fake, type SinonSpy } from 'sinon';
import { Result } from 'true-myth';
import type {
    PullRequest,
    PullRequestChangedFile,
    PullRequestLogEngine,
    PullRequestLogEngineOptions,
    PullRequestWithLabel
} from '../changelog/pull-request-log.ts';
import type { ConfigurationLoader } from '../command-line-interface/configuration-loader.ts';
import {
    runChangelogHandler,
    type ChangelogHandlerDependencies
} from '../command-line-interface/runner/changelog-handler.ts';
import type { TerminalSpinnerRenderer } from '../command-line-interface/spinner/terminal-spinner-renderer.ts';
import type { Packtory, ReleasePlanOutcome, ReleasePlanPackage, ReleasePlanResult } from '../packtory/packtory.ts';
import { createFakeFileManager, type FakeFileManager } from './fake-file-manager.ts';

export function releasePackage(overrides: Partial<ReleasePlanPackage> = {}): ReleasePlanPackage {
    return {
        name: 'package-a',
        previousVersion: '1.0.0',
        nextVersion: '1.0.1',
        artifactState: 'changed',
        releaseClassification: 'substantive',
        changed: true,
        previousGitHead: 'old-head',
        currentGitHead: 'new-head',
        latestRegistryMetadata: undefined,
        artifactFiles: [ 'index.js' ],
        changedArtifactFiles: [ 'index.js' ],
        sourceFiles: [ 'source/package-a.ts' ],
        changelogSourceFiles: [ 'source/package-a.ts' ],
        changelogDependencyNames: [],
        changelogDependencyUpdates: [],
        ...overrides
    };
}

export const validConfiguration = {
    packages: [
        {
            sourcesFolder: 'source/package-a',
            mainPackageManifest: { type: 'module' },
            name: 'package-a',
            roots: { main: { javaScript: 'index.js' } },
            publishSettings: { access: 'public' }
        }
    ]
} as const;

function releasePlanOutcomeFrom(result: ReleasePlanResult): ReleasePlanOutcome {
    return {
        result,
        getReport() {
            return {
                schemaVersion: 1 as const,
                generatedAt: '2026-06-13T00:00:00.000Z',
                packages: {},
                aggregate: { crossBundleLinks: [] }
            };
        }
    };
}

function outcome(packages: readonly ReleasePlanPackage[]): ReleasePlanOutcome {
    return releasePlanOutcomeFrom(Result.ok({ packages }));
}

export function configurationFailureOutcome(issues: readonly string[]): ReleasePlanOutcome {
    return releasePlanOutcomeFrom(Result.err({ type: 'configuration', issues }));
}

export function checkFailureOutcome(issues: readonly string[]): ReleasePlanOutcome {
    return releasePlanOutcomeFrom(Result.err({ type: 'checks', issues }));
}

export type PartialFailureOutcomeSpecification = {
    readonly succeeded: readonly ReleasePlanPackage[];
    readonly failures: readonly Error[];
};

export function partialFailureOutcome(input: PartialFailureOutcomeSpecification): ReleasePlanOutcome {
    return releasePlanOutcomeFrom(
        Result.err({ type: 'partial', succeeded: input.succeeded, failures: input.failures })
    );
}

type PullRequestFilterInput = {
    readonly pullRequests: readonly PullRequest[];
};

type TargetChangelogInput = {
    readonly targetName: string;
};

type ChangelogUpdateInput = {
    readonly generatedChangelogMarkdown: string;
};

type ChangelogLabelInput = {
    readonly targetScopedLabelPattern: string;
    readonly configuration: { readonly validLabels: ReadonlyMap<string, string>; };
};

export type EngineOverrides = {
    readonly resolveChangelogBaseReference?: SinonSpy;
    readonly resolvePullRequestLabels?: SinonSpy;
    readonly readPullRequestChangedFiles?: SinonSpy;
};

function changedFile(path: string): PullRequestChangedFile {
    return { path, previousPath: undefined, status: 'modified', additions: 1, deletions: 0, changes: 1 };
}

export function createEngine(overrides: EngineOverrides = {}): PullRequestLogEngine {
    const pullRequests: readonly PullRequest[] = [ { identifier: 1, title: 'Fix package' } ];
    const labeledPullRequests: readonly PullRequestWithLabel[] = [ {
        identifier: 1,
        title: 'Fix package',
        label: 'bug'
    } ];

    return {
        resolveLatestSemverChangelogBaseReference: fake.resolves({ reference: 'latest-semver' }),
        resolveChangelogBaseReference: overrides.resolveChangelogBaseReference ??
            fake.resolves({ reference: 'old-head' }),
        collectMergedPullRequests: fake.resolves(pullRequests),
        readPullRequestChangedFiles: overrides.readPullRequestChangedFiles ??
            fake.resolves(new Map([ [ 1, [ changedFile('source/package-a.ts') ] ] ])),
        readPullRequestLabels: fake.resolves(new Map([ [ 1, [ 'bug' ] ] ])),
        filterPullRequestsByTargetFiles: fake(function (input: PullRequestFilterInput) {
            return input.pullRequests;
        }),
        resolvePullRequestLabels: overrides.resolvePullRequestLabels ?? fake.resolves(labeledPullRequests),
        resolveVersionNumber: fake.returns('1.0.1'),
        extractChangelogReleaseSection: fake(function (): never {
            throw new Error('unexpected changelog section extraction');
        }),
        renderGroupedTargetChangelog: fake.returns('## package-a 1.0.1\n'),
        renderTargetChangelog: fake(function (input: TargetChangelogInput) {
            return `## ${input.targetName} 1.0.1\n`;
        }),
        updateChangelog: fake(function (input: ChangelogUpdateInput) {
            return `merged:\n${input.generatedChangelogMarkdown}`;
        }),
        renderChangelog: fake.returns('')
    };
}

export type Spies = {
    readonly createPullRequestLogEngine: SinonSpy;
    readonly log: SinonSpy;
    readonly pageOutput: SinonSpy;
    readonly planReleaseAgainstLatestPublished: SinonSpy;
    readonly stopAll: SinonSpy;
};

function spinnerRendererCapturing(stopAll: SinonSpy): TerminalSpinnerRenderer {
    return { stopAll } as unknown as TerminalSpinnerRenderer;
}

export function configurationLoaderReturning(configuration: unknown): ConfigurationLoader {
    return { load: fake.resolves(configuration) };
}

export type ChangelogHandlerDependenciesSpecification = {
    readonly spies: Spies;
    readonly configurationLoader?: ConfigurationLoader;
    readonly fileManager?: FakeFileManager;
    readonly readPackageInformation?: () => Promise<Readonly<Record<string, unknown>>>;
    readonly readEnvironmentVariable?: (name: 'GH_TOKEN' | 'GITHUB_TOKEN') => string | undefined;
    readonly trace?: boolean;
};

export function dependenciesWith(input: ChangelogHandlerDependenciesSpecification): ChangelogHandlerDependencies {
    return {
        log(message) {
            input.spies.log(message);
        },
        pageOutput: input.spies.pageOutput,
        packtory: {
            planReleaseAgainstLatestPublished: input.spies.planReleaseAgainstLatestPublished
        } as unknown as Packtory,
        fileManager: input.fileManager ?? createFakeFileManager(),
        spinnerRenderer: spinnerRendererCapturing(input.spies.stopAll),
        configurationLoader: input.configurationLoader ?? configurationLoaderReturning(validConfiguration),
        createPullRequestLogEngine: input.spies.createPullRequestLogEngine,
        currentDate() {
            return new Date('2026-06-13T00:00:00.000Z');
        },
        readEnvironmentVariable: input.readEnvironmentVariable ??
            function (name) {
                return name === 'GH_TOKEN' ? 'gh-token' : undefined;
            },
        readPackageInformation: input.readPackageInformation ??
            async function () {
                return { repository: { url: 'git+https://github.com/Owner/Repo.git' } };
            },
        trace: input.trace ?? false,
        workingDirectory: '/repo'
    };
}

export function assertMissingGitHubRepositoryLog(spies: Spies): void {
    assert.deepStrictEqual(spies.log.firstCall.args, [ 'package.json repository must point to a GitHub repository' ]);
}

export function makeSpies(
    engine: PullRequestLogEngine = createEngine(),
    releasePlanOutcome: ReleasePlanOutcome = outcome([ releasePackage() ])
): Spies {
    return {
        createPullRequestLogEngine: fake(function (options: Readonly<PullRequestLogEngineOptions>) {
            assert.partialDeepStrictEqual(options, {
                githubToken: 'gh-token',
                workingDirectory: '/repo'
            });
            assert.strictEqual(options.configuration.maximumRateLimitRetryCount, 3);
            return engine;
        }),
        log: fake(),
        pageOutput: fake.resolves(undefined),
        planReleaseAgainstLatestPublished: fake.resolves(releasePlanOutcome),
        stopAll: fake()
    };
}

export type ReleasePlanFailureLogSpecification = {
    readonly releasePlanOutcome: ReleasePlanOutcome;
    readonly expectedLog: string;
};

export async function assertReleasePlanFailureLogged(input: ReleasePlanFailureLogSpecification): Promise<void> {
    const spies = makeSpies(createEngine(), input.releasePlanOutcome);

    const code = await runChangelogHandler(dependenciesWith({ spies }));

    assert.strictEqual(code, 1);
    assert.deepStrictEqual(
        {
            createPullRequestLogEngine: spies.createPullRequestLogEngine.callCount,
            logArguments: spies.log.firstCall.args
        },
        { createPullRequestLogEngine: 0, logArguments: [ input.expectedLog ] }
    );
}

export function assertConfiguredChangelogInputs(
    resolveChangelogBaseReference: SinonSpy,
    resolvePullRequestLabels: SinonSpy
): void {
    assert.deepStrictEqual(resolveChangelogBaseReference.firstCall.args[0], {
        packageName: 'package-a',
        previousVersion: '1.0.0',
        previousGitHead: 'old-head',
        packageTagFormat: 'pkg/{packageName}/v{version}',
        explicitBaseReference: 'main'
    });
    const labelInput = resolvePullRequestLabels.firstCall.args[0] as ChangelogLabelInput;
    assert.strictEqual(labelInput.targetScopedLabelPattern, 'scope:{targetName}:{label}');
    assert.strictEqual(labelInput.configuration.validLabels.get('bug'), 'Bug Fixes');
    assert.strictEqual(labelInput.configuration.validLabels.get('operations'), 'Operations');
}

export type ChangelogEntryInput = Parameters<PullRequestLogEngine['renderChangelog']>[0]['mergedPullRequests'][number];
export type CollectMergedPullRequestsOptions = Parameters<PullRequestLogEngine['collectMergedPullRequests']>[0];
export type FilterPullRequestsByTargetFilesInput = Parameters<
    PullRequestLogEngine['filterPullRequestsByTargetFiles']
>[0];
export type ResolvePullRequestLabelsOptions = Parameters<PullRequestLogEngine['resolvePullRequestLabels']>[0];
export type RenderGroupedTargetChangelogMarkdownInput = Parameters<
    PullRequestLogEngine['renderGroupedTargetChangelog']
>[0];
export type RenderTargetChangelogMarkdownInput = Parameters<PullRequestLogEngine['renderTargetChangelog']>[0];
