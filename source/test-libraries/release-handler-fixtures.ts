import assert from 'node:assert';
import { fake, type SinonSpy } from 'sinon';
import { Result } from 'true-myth';
import type { PullRequestChangedFile, PullRequestLogEngine } from '../changelog/pull-request-log.ts';
import {
    runReleaseHandler,
    type ReleaseHandlerDependencies
} from '../command-line-interface/runner/release-handler.ts';
import type { BuildAndPublishResult } from '../packtory/package-processor.ts';
import type { Packtory, ReleasePlanOutcome, ReleasePlanPackage, ReleasePlanResult } from '../packtory/packtory.ts';
import { createBuildReportFixture } from './preview-fixtures.ts';
import { createGitHubReleaseClientFixture } from './runner-test-support.ts';

export const validConfiguration = {
    packages: [
        {
            sourcesFolder: 'source/package-a',
            mainPackageManifest: { type: 'module' },
            name: 'package-a',
            roots: { main: { javaScript: 'index.js' } },
            publishSettings: { access: 'public' }
        }
    ],
    changelog: { outputs: [ { kind: 'github-release' } ] }
} as const;

export function releasePackage(overrides: Partial<ReleasePlanPackage> = {}): ReleasePlanPackage {
    return {
        name: 'package-a',
        previousVersion: '1.0.0',
        nextVersion: '1.0.1',
        artifactState: 'changed',
        releaseClassification: 'substantive',
        changed: true,
        previousGitHead: 'old-head',
        currentGitHead: 'release-head',
        latestRegistryMetadata: { version: '1.0.0', publishedAt: undefined, gitHead: 'old-head' },
        artifactFiles: [ 'index.js' ],
        changedArtifactFiles: [ 'index.js' ],
        sourceFiles: [ 'source/package-a/index.ts' ],
        changelogDependencyNames: [],
        changelogDependencyUpdates: [],
        changelogSourceFiles: [ 'source/package-a/index.ts' ],
        ...overrides
    };
}

export function currentHeadPublishedPackage(overrides: Partial<ReleasePlanPackage> = {}): ReleasePlanPackage {
    return releasePackage({
        artifactState: 'unchanged',
        changed: false,
        latestRegistryMetadata: { version: '1.0.1', publishedAt: undefined, gitHead: 'release-head' },
        ...overrides
    });
}

function releasePlanOutcomeFrom(result: ReleasePlanResult): ReleasePlanOutcome {
    return {
        result,
        getReport() {
            return createBuildReportFixture();
        }
    };
}

function releasePlanOutcome(packages: readonly ReleasePlanPackage[]): ReleasePlanOutcome {
    return releasePlanOutcomeFrom(Result.ok({ packages }));
}

export function publishResult(name: string, version: string): BuildAndPublishResult {
    return {
        status: 'new-version',
        bundle: { name, version },
        publication: { type: 'published' },
        extraFiles: [],
        previousReleaseArtifacts: { isJust: false }
    } as unknown as BuildAndPublishResult;
}

export function successfulPublish(results: readonly BuildAndPublishResult[]): SinonSpy {
    return fake.resolves({
        result: Result.ok(results),
        getReport() {
            return createBuildReportFixture();
        }
    });
}

export function failedPublish(): SinonSpy {
    return fake.resolves({
        result: Result.err({ type: 'configuration', issues: [ 'publish failed' ] }),
        getReport() {
            return createBuildReportFixture();
        }
    });
}

export function failedPartialPublish(): SinonSpy {
    return fake.resolves({
        result: Result.err({
            type: 'partial',
            succeeded: [
                {
                    ...publishResult('package-a', '1.0.1'),
                    publication: { type: 'staged', stageIdentifier: 'stage-id' }
                }
            ],
            failures: [ new Error('publish failed') ]
        }),
        getReport() {
            return createBuildReportFixture();
        }
    });
}

export function failedReleasePlan(): SinonSpy {
    return fake.resolves(
        releasePlanOutcomeFrom(
            Result.err({ type: 'configuration', issues: [ 'invalid release plan' ] }) as ReleasePlanResult
        )
    );
}

function changedFile(path: string): PullRequestChangedFile {
    return { path, previousPath: undefined, status: 'modified', additions: 1, deletions: 0, changes: 1 };
}

function createEngine(): PullRequestLogEngine {
    const pullRequest = { identifier: 1, title: 'Fix package' };
    const releaseNotes = '## package-a 1.0.1\n\n* Fix package';
    return {
        collectMergedPullRequests: fake.resolves([ pullRequest ]),
        filterPullRequestsByTargetFiles: fake.returns([ pullRequest ]),
        renderChangelog: fake.returns(''),
        renderGroupedTargetChangelog: fake.returns(releaseNotes),
        readPullRequestChangedFiles: fake.resolves(
            new Map([ [ pullRequest.identifier, [ changedFile('source/package-a/index.ts') ] ] ])
        ),
        readPullRequestLabels: fake.resolves(new Map([ [ pullRequest.identifier, [ 'bug' ] ] ])),
        extractChangelogReleaseSection: fake(function (): never {
            throw new Error('unexpected changelog section extraction');
        }),
        renderTargetChangelog: fake.returns(releaseNotes),
        resolveChangelogBaseReference: fake.resolves({ reference: 'old-head' }),
        resolveLatestSemverChangelogBaseReference: fake.resolves({ reference: 'latest-semver' }),
        resolvePullRequestLabels: fake.resolves([ { ...pullRequest, label: 'bug' } ]),
        resolveVersionNumber: fake.returns('1.0.1'),
        updateChangelog: fake.returns('')
    };
}

export type DependencyOverrides = {
    readonly buildAndPublishAll?: SinonSpy;
    readonly createPullRequestLogEngine?: SinonSpy;
    readonly createGitHubReleaseClient?: SinonSpy;
    readonly flags?: ReleaseHandlerDependencies['flags'];
    readonly log?: SinonSpy;
    readonly packages?: readonly ReleasePlanPackage[];
    readonly planReleaseAgainstLatestPublished?: SinonSpy;
    readonly readEnvironmentVariable?: ReleaseHandlerDependencies['readEnvironmentVariable'];
    readonly readPackageInformation?: ReleaseHandlerDependencies['readPackageInformation'];
    readonly trace?: boolean;
};

export type CreatedReleaseHandlerDependencies = ReleaseHandlerDependencies & {
    readonly buildAndPublishAll: SinonSpy;
    readonly createPullRequestLogEngine: SinonSpy;
    readonly createGitHubReleaseClient: SinonSpy;
    readonly log: SinonSpy;
};

type CompleteDependencyOverrides = Required<DependencyOverrides>;

function createPlanRelease(packages: readonly ReleasePlanPackage[]): SinonSpy {
    return fake.resolves(releasePlanOutcome(packages));
}

function createPacktory(
    buildAndPublishAll: SinonSpy,
    planReleaseAgainstLatestPublished: SinonSpy
): Packtory {
    async function unusedPacktoryMethod(): Promise<never> {
        throw new Error('unused packtory method');
    }
    return {
        analyzeReleaseAgainstLatestPublished: unusedPacktoryMethod,
        buildAndPublishAll,
        diffAgainstLatestPublished: unusedPacktoryMethod,
        inspectPackageDependencies: unusedPacktoryMethod,
        inspectPackageSideEffects: unusedPacktoryMethod,
        inspectPackageTree: unusedPacktoryMethod,
        packAllPackages: unusedPacktoryMethod,
        packPackage: unusedPacktoryMethod,
        planReleaseAgainstLatestPublished,
        resolveAndLinkAll: unusedPacktoryMethod
    };
}

function createDefaultPublish(): SinonSpy {
    return successfulPublish([ publishResult('package-a', '1.0.1') ]);
}

function createDefaultFlags(): ReleaseHandlerDependencies['flags'] {
    return { githubRelease: false, noDryRun: false, publish: false, push: false, tag: false };
}

function readDefaultEnvironmentVariable(name: 'GH_TOKEN' | 'GITHUB_TOKEN'): string | undefined {
    return name === 'GH_TOKEN' ? 'gh-token' : undefined;
}

async function readDefaultPackageInformation(): Promise<Readonly<Record<string, unknown>>> {
    return { repository: { url: 'https://github.com/owner/repo' } };
}

function createCompleteDependencyOverrides(overrides: DependencyOverrides): CompleteDependencyOverrides {
    const packages = overrides.packages ?? [ releasePackage() ];
    return {
        buildAndPublishAll: createDefaultPublish(),
        createPullRequestLogEngine: fake.returns(createEngine()),
        createGitHubReleaseClient: fake.returns(createGitHubReleaseClientFixture({})),
        flags: createDefaultFlags(),
        log: fake(),
        packages,
        planReleaseAgainstLatestPublished: createPlanRelease(packages),
        readEnvironmentVariable: readDefaultEnvironmentVariable,
        readPackageInformation: readDefaultPackageInformation,
        trace: false,
        ...overrides
    };
}

export function createDependencies(overrides: DependencyOverrides = {}): CreatedReleaseHandlerDependencies {
    const completeOverrides = createCompleteDependencyOverrides(overrides);
    return {
        buildAndPublishAll: completeOverrides.buildAndPublishAll,
        createGitHubReleaseClient: completeOverrides.createGitHubReleaseClient,
        createPullRequestLogEngine: completeOverrides.createPullRequestLogEngine,
        currentDate() {
            return new Date('2026-06-13T00:00:00.000Z');
        },
        fileManager: {
            readFile: fake.resolves('')
        },
        flags: completeOverrides.flags,
        log: completeOverrides.log,
        packtory: createPacktory(
            completeOverrides.buildAndPublishAll,
            completeOverrides.planReleaseAgainstLatestPublished
        ),
        readEnvironmentVariable: completeOverrides.readEnvironmentVariable,
        readPackageInformation: completeOverrides.readPackageInformation,
        spinnerRenderer: { stopAll: fake() },
        configurationLoader: { load: fake.resolves(validConfiguration) },
        trace: completeOverrides.trace,
        workingDirectory: '/repo'
    };
}

export async function assertNoReleaseWork(dependencies: CreatedReleaseHandlerDependencies): Promise<void> {
    assert.strictEqual(await runReleaseHandler(dependencies), 0);
    assert.strictEqual(dependencies.log.firstCall.args[0], 'No packages need release.');
    assert.strictEqual(dependencies.buildAndPublishAll.callCount, 0);
}

export function assertAnnotatedTagCreated(ensureAnnotatedTag: SinonSpy): void {
    assert.deepStrictEqual(ensureAnnotatedTag.firstCall.args, [
        { tagName: 'package-a@1.0.1', message: 'package-a@1.0.1', targetHead: 'release-head' }
    ]);
}
