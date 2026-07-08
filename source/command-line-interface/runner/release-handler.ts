import type { PrLogConfig, PrLogEngine, PrLogEngineOptions } from '@pr-log/core';
import type { Packtory, ReleasePlanPackage } from '../../packtory/packtory.ts';
import { generateChangelogOutputs, type GeneratedChangelog } from '../../packtory/packtory-changelog.ts';
import {
    collectGeneratedAttributionPaths,
    createChangelogGenerationOptions,
    parseValidConfig,
    writeConfiguredChangelogs
} from './changelog-destinations.ts';
import { printPublishFailure } from './failure-printing.ts';
import type { GitHubReleaseClient } from './github-release-client.ts';
import { collectGitHubReleaseNotes, missingGitHubReleaseNotes } from './github-release-notes.ts';
import { formatGitHubRepositoryName, parseGitHubRepositoryParts } from './github-repository.ts';
import type { ReleaseGitClient } from './release-git-client.ts';
import { printReleasePlanFailure } from './release-plan-result-printing.ts';

type Logger = (message: string) => void;
type EnvironmentVariableName = 'GH_TOKEN' | 'GITHUB_TOKEN';
type ReleaseTarget = {
    readonly name: string;
    readonly tagName: string;
    readonly version: string;
};
type ValidChangelogConfig = NonNullable<ReturnType<typeof parseValidConfig>>;
type ReleaseChangelog = {
    readonly changelog: GeneratedChangelog;
    readonly config: ValidChangelogConfig;
    readonly engine: PrLogEngine;
};
type PlannedRelease = {
    readonly config: unknown;
    readonly packages: readonly ReleasePlanPackage[];
};
type ChangelogStepResult = {
    readonly changelog: ReleaseChangelog | undefined;
    readonly planned: PlannedRelease;
};
type MutatingReleaseStateBase = {
    readonly changedTargets: readonly ReleaseTarget[];
    readonly planned: PlannedRelease;
};
type GitHubReleaseState = {
    readonly changelog: ReleaseChangelog;
    readonly githubRelease: true;
};
type GitlessReleaseState = {
    readonly changelog: ReleaseChangelog | undefined;
    readonly githubRelease: false;
};
type MutatingReleaseState = MutatingReleaseStateBase & (GitHubReleaseState | GitlessReleaseState);
type FlagRule = {
    readonly failed: (flags: ReleaseFlags) => boolean;
    readonly message: string;
};
type GitHubReleaseClientContext = {
    readonly owner: string;
    readonly repo: string;
    readonly token: string;
};

type ReleaseFlags = {
    readonly commit: boolean;
    readonly githubRelease: boolean;
    readonly noDryRun: boolean;
    readonly publish: boolean;
    readonly push: boolean;
    readonly tag: boolean;
    readonly writeChangelog: boolean;
};

export type ReleaseHandlerDeps = {
    readonly createGitHubReleaseClient: (context: GitHubReleaseClientContext) => GitHubReleaseClient;
    readonly createPrLogEngine: (options: Readonly<PrLogEngineOptions>) => PrLogEngine;
    readonly currentDate: () => Date;
    readonly fileManager: {
        readonly readFile: (filePath: string) => Promise<string>;
        readonly writeFile: (filePath: string, content: string) => Promise<void>;
    };
    readonly flags: ReleaseFlags;
    readonly gitClient: ReleaseGitClient;
    readonly log: Logger;
    readonly packtory: Packtory;
    readonly readEnvironmentVariable: (name: EnvironmentVariableName) => string | undefined;
    readonly readPackageInfo: () => Promise<Readonly<Record<string, unknown>>>;
    readonly spinnerRenderer: { readonly stopAll: () => void; };
    readonly configLoader: { readonly load: () => Promise<unknown>; };
    readonly workingDirectory: string;
};

const releaseCommitMessage = 'Release packages';

function formatReleaseHandlerError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function hasAction(flags: ReleaseFlags): boolean {
    return flags.writeChangelog || flags.commit || flags.publish || flags.tag || flags.push || flags.githubRelease;
}

function isCommitWithoutChangelog(flags: ReleaseFlags): boolean {
    return flags.commit && !flags.writeChangelog;
}

function isChangelogPublishWithoutCommit(flags: ReleaseFlags): boolean {
    return flags.writeChangelog && flags.publish && !flags.commit;
}

function isPushWithoutSource(flags: ReleaseFlags): boolean {
    return flags.push && !(flags.commit || flags.tag);
}

function isGitHubReleaseWithoutGitPublication(flags: ReleaseFlags): boolean {
    return flags.githubRelease && !(flags.tag && flags.push);
}

function isReleaseWriteWithoutMutationApproval(flags: ReleaseFlags): boolean {
    return hasAction(flags) && !flags.noDryRun;
}

const flagRules: readonly FlagRule[] = [
    { failed: isCommitWithoutChangelog, message: '--commit requires --write-changelog' },
    { failed: isChangelogPublishWithoutCommit, message: '--write-changelog --publish requires --commit' },
    { failed: isPushWithoutSource, message: '--push requires --commit or --tag' },
    { failed: isGitHubReleaseWithoutGitPublication, message: '--github-release requires --tag --push' },
    { failed: isReleaseWriteWithoutMutationApproval, message: 'Release writes require --no-dry-run' }
];

function collectFlagIssues(flags: ReleaseFlags): readonly string[] {
    return flagRules.flatMap(function (rule) {
        return rule.failed(flags) ? [ rule.message ] : [];
    });
}

function createTargetFromPlanPackage(packagePlan: ReleasePlanPackage): ReleaseTarget {
    return {
        name: packagePlan.name,
        version: packagePlan.nextVersion,
        tagName: `${packagePlan.name}@${packagePlan.nextVersion}`
    };
}

function selectChangedTargets(packages: readonly ReleasePlanPackage[]): readonly ReleaseTarget[] {
    return packages
        .filter(function (packagePlan) {
            return packagePlan.changed;
        })
        .map(createTargetFromPlanPackage);
}

function selectCurrentHeadPublishedTargets(packages: readonly ReleasePlanPackage[]): readonly ReleaseTarget[] {
    return packages
        .filter(function (packagePlan) {
            return (
                packagePlan.currentGitHead !== undefined &&
                packagePlan.latestRegistryMetadata?.gitHead === packagePlan.currentGitHead
            );
        })
        .map(createTargetFromPlanPackage);
}

function mapTargetsByName(targets: readonly ReleaseTarget[]): ReadonlyMap<string, ReleaseTarget> {
    return new Map(
        targets.map(function (target) {
            return [ target.name, target ];
        })
    );
}

function mergeTargets(...targetGroups: readonly (readonly ReleaseTarget[])[]): readonly ReleaseTarget[] {
    const targetsByName = new Map(
        targetGroups.flatMap(function (targets) {
            return targets.map(function (target) {
                return [ target.name, target ] as const;
            });
        })
    );
    return Array.from(targetsByName.values());
}

function assertTagRule(flags: ReleaseFlags, changedTargets: readonly ReleaseTarget[]): void {
    if (flags.tag && !flags.publish && changedTargets.length > 0) {
        throw new Error('--tag requires --publish unless registry latest already matches the current Git head');
    }
}

function hasReleaseWork(flags: ReleaseFlags, packages: readonly ReleasePlanPackage[]): boolean {
    if (selectChangedTargets(packages).length > 0) {
        return true;
    }
    return (flags.tag || flags.githubRelease) && selectCurrentHeadPublishedTargets(packages).length > 0;
}

function formatPlanPackage(packagePlan: ReleasePlanPackage): string {
    const previousVersion = packagePlan.previousVersion ?? 'unpublished';
    return `- ${packagePlan.name}: ${previousVersion} -> ${packagePlan.nextVersion} (${packagePlan.artifactState})`;
}

function printReleasePlan(log: Logger, packages: readonly ReleasePlanPackage[]): void {
    const changedPackages = packages.filter(function (packagePlan) {
        return packagePlan.changed;
    });
    if (changedPackages.length === 0) {
        log('No packages need release.');
        return;
    }
    log([ 'Release plan:', ...changedPackages.map(formatPlanPackage) ].join('\n'));
}

function readGitHubToken(deps: Pick<ReleaseHandlerDeps, 'readEnvironmentVariable'>): string | undefined {
    return deps.readEnvironmentVariable('GH_TOKEN') ?? deps.readEnvironmentVariable('GITHUB_TOKEN');
}

function createEngine(deps: ReleaseHandlerDeps, config: PrLogConfig): PrLogEngine {
    return deps.createPrLogEngine({
        githubToken: readGitHubToken(deps),
        workingDirectory: deps.workingDirectory,
        config
    });
}

async function generateReleaseChangelog(
    deps: ReleaseHandlerDeps,
    config: ValidChangelogConfig,
    packages: readonly ReleasePlanPackage[]
): Promise<ReleaseChangelog> {
    const packageInfo = await deps.readPackageInfo();
    const generationOptions = createChangelogGenerationOptions(config);
    const engine = createEngine(deps, generationOptions.prLogConfig);
    const changelog = await generateChangelogOutputs({
        packages,
        prLogEngine: engine,
        explicitBaseRef: generationOptions.explicitBaseRef,
        githubRepo: formatGitHubRepositoryName(packageInfo),
        ignoredAttributionPaths: collectGeneratedAttributionPaths(deps, config),
        currentDate: deps.currentDate(),
        packageTagFormat: generationOptions.packageTagFormat,
        prLogConfig: generationOptions.prLogConfig,
        targetScopedLabelPattern: generationOptions.targetScopedLabelPattern
    });
    return { changelog, config, engine };
}

async function planRelease(
    deps: ReleaseHandlerDeps,
    config: unknown
): Promise<readonly ReleasePlanPackage[] | undefined> {
    const outcome = await deps.packtory.planReleaseAgainstLatestPublished(config);
    deps.spinnerRenderer.stopAll();
    if (outcome.result.isErr) {
        printReleasePlanFailure(deps.log, outcome.result.error);
        return undefined;
    }
    return outcome.result.value.packages;
}

async function publishTargets(
    deps: ReleaseHandlerDeps,
    config: unknown,
    changedTargets: readonly ReleaseTarget[]
): Promise<readonly ReleaseTarget[] | undefined> {
    if (changedTargets.length === 0) {
        return [];
    }
    const changedTargetsByName = mapTargetsByName(changedTargets);
    const outcome = await deps.packtory.buildAndPublishAll(config, {
        dryRun: false,
        stage: false,
        collectReport: false
    });
    deps.spinnerRenderer.stopAll();
    if (outcome.result.isErr) {
        printPublishFailure(deps.log, outcome.result.error, false);
        return undefined;
    }
    return outcome.result.value.flatMap(function (result) {
        const plannedTarget = changedTargetsByName.get(result.bundle.name);
        if (plannedTarget === undefined) {
            return [];
        }
        return [
            {
                name: result.bundle.name,
                version: result.bundle.version,
                tagName: `${result.bundle.name}@${result.bundle.version}`
            }
        ];
    });
}

async function ensureTags(deps: ReleaseHandlerDeps, targets: readonly ReleaseTarget[]): Promise<void> {
    const head = await deps.gitClient.currentHead();
    for (const target of targets) {
        await deps.gitClient.ensureTag(target.tagName, target.tagName, head);
    }
}

async function createGitHubReleases(
    deps: ReleaseHandlerDeps,
    config: ValidChangelogConfig,
    targets: readonly ReleaseTarget[],
    changelog: GeneratedChangelog
): Promise<void> {
    const token = readGitHubToken(deps);
    if (token === undefined) {
        throw new Error('GH_TOKEN or GITHUB_TOKEN must be set to create GitHub releases');
    }
    const repository = parseGitHubRepositoryParts(await deps.readPackageInfo());
    const client = deps.createGitHubReleaseClient({ ...repository, token });
    const releaseNotesByPackageName = await collectGitHubReleaseNotes(deps, config, targets, changelog);
    for (const target of targets) {
        await client.createReleaseIfMissing({
            tagName: target.tagName,
            name: target.tagName,
            body: releaseNotesByPackageName.get(target.name) ?? missingGitHubReleaseNotes(target)
        });
    }
}

function reportFlagIssues(deps: ReleaseHandlerDeps): number | undefined {
    const issues = collectFlagIssues(deps.flags);
    if (issues.length > 0) {
        deps.log(issues.join('\n'));
        return 1;
    }
    return undefined;
}

async function loadPlannedRelease(deps: ReleaseHandlerDeps): Promise<PlannedRelease | undefined> {
    const config = await deps.configLoader.load();
    const packages = await planRelease(deps, config);
    if (packages === undefined) {
        return undefined;
    }
    return { config, packages };
}

function resolvePlannedReleaseExitCode(
    deps: ReleaseHandlerDeps,
    packages: readonly ReleasePlanPackage[]
): number | undefined {
    if (!hasAction(deps.flags)) {
        printReleasePlan(deps.log, packages);
        return 0;
    }
    if (!hasReleaseWork(deps.flags, packages)) {
        deps.log('No packages need release.');
        return 0;
    }
    return undefined;
}

function parseRequiredChangelogConfig(config: unknown): ValidChangelogConfig {
    const validConfig = parseValidConfig(config);
    if (validConfig === undefined) {
        throw new Error('The loaded config is invalid for changelog generation');
    }
    return validConfig;
}

async function generateRequiredChangelog(
    deps: ReleaseHandlerDeps,
    config: unknown,
    packages: readonly ReleasePlanPackage[]
): Promise<ReleaseChangelog> {
    return generateReleaseChangelog(deps, parseRequiredChangelogConfig(config), packages);
}

async function commitChangelogAndReplan(
    deps: ReleaseHandlerDeps,
    changelog: ReleaseChangelog,
    writtenPaths: readonly string[]
): Promise<ChangelogStepResult | undefined> {
    await deps.gitClient.commit(writtenPaths, releaseCommitMessage);
    const committedPlan = await loadPlannedRelease(deps);
    return committedPlan === undefined ? undefined : { changelog, planned: committedPlan };
}

function formatEmptyChangelogMessage(changelog: GeneratedChangelog): string {
    const packageNames = changelog.packageNamesWithoutChangelogEntries;
    if (packageNames.length === 0) {
        return 'No changelog files were written.';
    }
    return [
        'No changelog files were written; changelog attribution found no pull requests for ',
        packageNames.join(', '),
        '.'
    ]
        .join('');
}

function reportUnwrittenChangelogs(
    deps: Pick<ReleaseHandlerDeps, 'flags' | 'log'>,
    changelog: GeneratedChangelog,
    writtenPaths: readonly string[]
): void {
    if (writtenPaths.length > 0) {
        return;
    }
    const message = formatEmptyChangelogMessage(changelog);
    if (deps.flags.commit) {
        throw new Error(message);
    }
    deps.log(message);
}

async function writeChangelogAndMaybeCommit(
    deps: ReleaseHandlerDeps,
    planned: PlannedRelease
): Promise<ChangelogStepResult | undefined> {
    if (!deps.flags.writeChangelog) {
        return { changelog: undefined, planned };
    }
    const validConfig = parseRequiredChangelogConfig(planned.config);
    const changelog = await generateReleaseChangelog(deps, validConfig, planned.packages);
    const writtenPaths = await writeConfiguredChangelogs(deps, changelog.config, changelog.engine, changelog.changelog);
    reportUnwrittenChangelogs(deps, changelog.changelog, writtenPaths);
    if (!deps.flags.commit) {
        return { changelog, planned };
    }
    return commitChangelogAndReplan(deps, changelog, writtenPaths);
}

async function publishOrRetryTargets(
    deps: ReleaseHandlerDeps,
    planned: PlannedRelease,
    changedTargets: readonly ReleaseTarget[]
): Promise<readonly ReleaseTarget[] | undefined> {
    if (deps.flags.publish) {
        return publishTargets(deps, planned.config, changedTargets);
    }
    return selectCurrentHeadPublishedTargets(planned.packages);
}

async function finishReleaseActions(
    deps: ReleaseHandlerDeps,
    state: MutatingReleaseState,
    publishedTargets: readonly ReleaseTarget[]
): Promise<void> {
    const releaseTargets = mergeTargets(publishedTargets, selectCurrentHeadPublishedTargets(state.planned.packages));
    if (deps.flags.tag) {
        await ensureTags(deps, releaseTargets);
    }
    if (deps.flags.push) {
        await deps.gitClient.pushFollowTags();
    }
    if (state.githubRelease) {
        await createGitHubReleases(deps, state.changelog.config, releaseTargets, state.changelog.changelog);
    }
}

async function createMutatingReleaseState(
    deps: ReleaseHandlerDeps,
    changelogStep: ChangelogStepResult
): Promise<MutatingReleaseState> {
    const base = {
        changedTargets: selectChangedTargets(changelogStep.planned.packages),
        planned: changelogStep.planned
    };
    if (deps.flags.githubRelease) {
        return {
            ...base,
            githubRelease: true,
            changelog: changelogStep.changelog ??
                await generateRequiredChangelog(deps, changelogStep.planned.config, changelogStep.planned.packages)
        };
    }
    return { ...base, githubRelease: false, changelog: changelogStep.changelog };
}

async function prepareMutatingRelease(
    deps: ReleaseHandlerDeps,
    planned: PlannedRelease
): Promise<MutatingReleaseState | undefined> {
    const initialChangedTargets = selectChangedTargets(planned.packages);
    assertTagRule(deps.flags, initialChangedTargets);

    await deps.gitClient.ensureClean();

    const changelogStep = await writeChangelogAndMaybeCommit(deps, planned);
    if (changelogStep === undefined) {
        return undefined;
    }
    return createMutatingReleaseState(deps, changelogStep);
}

async function finishAndReportRelease(
    deps: ReleaseHandlerDeps,
    state: MutatingReleaseState,
    publishedTargets: readonly ReleaseTarget[]
): Promise<number> {
    await finishReleaseActions(deps, state, publishedTargets);
    deps.log('Release completed.');
    return 0;
}

async function runMutatingRelease(deps: ReleaseHandlerDeps, planned: PlannedRelease): Promise<number> {
    const state = await prepareMutatingRelease(deps, planned);
    if (state === undefined) {
        return 1;
    }
    const publishedTargets = await publishOrRetryTargets(deps, state.planned, state.changedTargets);
    if (publishedTargets === undefined) {
        return 1;
    }
    return finishAndReportRelease(deps, state, publishedTargets);
}

async function runRelease(deps: ReleaseHandlerDeps): Promise<number> {
    const flagExitCode = reportFlagIssues(deps);
    if (flagExitCode !== undefined) {
        return flagExitCode;
    }
    const planned = await loadPlannedRelease(deps);
    if (planned === undefined) {
        return 1;
    }
    return resolvePlannedReleaseExitCode(deps, planned.packages) ?? runMutatingRelease(deps, planned);
}

function stopSpinnersAndReturn(deps: ReleaseHandlerDeps, exitCode: number): number {
    deps.spinnerRenderer.stopAll();
    return exitCode;
}

export async function runReleaseHandler(deps: ReleaseHandlerDeps): Promise<number> {
    try {
        return stopSpinnersAndReturn(deps, await runRelease(deps));
    } catch (error: unknown) {
        deps.log(formatReleaseHandlerError(error));
        return stopSpinnersAndReturn(deps, 1);
    }
}
