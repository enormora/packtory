import type { Packtory, ReleasePlanPackage } from '../../packtory/packtory.ts';
import { printPublishFailure } from './failure-printing.ts';
import type { GitHubReleaseClient } from './github-release-client.ts';
import { collectGitHubReleaseNotes, missingGitHubReleaseNotes } from './github-release-notes.ts';
import { parseGitHubRepositoryParts } from './github-repository.ts';
import {
    generateRequiredChangelog,
    loadPlannedRelease,
    type PlannedRelease,
    type ReleasePreparationDeps
} from './release-preparation.ts';

type Logger = (message: string) => void;
type EnvironmentVariableName = 'GH_TOKEN' | 'GITHUB_TOKEN';
type ReleaseTarget = {
    readonly name: string;
    readonly tagName: string;
    readonly targetHead: string | undefined;
    readonly version: string;
};
type PublishedReleaseTarget = ReleaseTarget & {
    readonly targetHead: string;
};
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
    readonly githubRelease: boolean;
    readonly noDryRun: boolean;
    readonly publish: boolean;
    readonly push: boolean;
    readonly tag: boolean;
};

export type ReleaseHandlerDeps = ReleasePreparationDeps & {
    readonly createGitHubReleaseClient: (context: GitHubReleaseClientContext) => GitHubReleaseClient;
    readonly fileManager: ReleasePreparationDeps['fileManager'];
    readonly flags: ReleaseFlags;
    readonly packtory: Packtory;
    readonly readEnvironmentVariable: (name: EnvironmentVariableName) => string | undefined;
};

const releaseCompletedMessage = 'Release completed.';

function formatReleaseHandlerError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function hasAction(flags: ReleaseFlags): boolean {
    return flags.publish || flags.tag || flags.push || flags.githubRelease;
}

function isPushWithoutTag(flags: ReleaseFlags): boolean {
    return flags.push && !flags.tag;
}

function isGitHubReleaseWithoutTagPublication(flags: ReleaseFlags): boolean {
    return flags.githubRelease && !(flags.tag && flags.push);
}

function isReleaseWriteWithoutMutationApproval(flags: ReleaseFlags): boolean {
    return hasAction(flags) && !flags.noDryRun;
}

const flagRules: readonly FlagRule[] = [
    { failed: isPushWithoutTag, message: '--push requires --tag' },
    { failed: isGitHubReleaseWithoutTagPublication, message: '--github-release requires --tag --push' },
    { failed: isReleaseWriteWithoutMutationApproval, message: 'Release writes require --no-dry-run' }
];

function collectFlagIssues(flags: ReleaseFlags): readonly string[] {
    return flagRules.flatMap(function (rule) {
        return rule.failed(flags) ? [ rule.message ] : [];
    });
}

function targetFromPlanPackage(packagePlan: ReleasePlanPackage): ReleaseTarget {
    return {
        name: packagePlan.name,
        version: packagePlan.nextVersion,
        tagName: `${packagePlan.name}@${packagePlan.nextVersion}`,
        targetHead: packagePlan.currentGitHead
    };
}

function requireTargetHead(target: ReleaseTarget): PublishedReleaseTarget {
    if (target.targetHead === undefined) {
        throw new Error(`GitHub tag target for "${target.tagName}" could not be determined`);
    }
    return { ...target, targetHead: target.targetHead };
}

function selectChangedTargets(packages: readonly ReleasePlanPackage[]): readonly ReleaseTarget[] {
    return packages
        .filter(function (packagePlan) {
            return packagePlan.changed;
        })
        .map(targetFromPlanPackage);
}

function selectCurrentHeadPublishedTargets(packages: readonly ReleasePlanPackage[]): readonly PublishedReleaseTarget[] {
    return packages
        .filter(function (packagePlan) {
            return (
                packagePlan.currentGitHead !== undefined &&
                packagePlan.latestRegistryMetadata?.gitHead === packagePlan.currentGitHead
            );
        })
        .map(targetFromPlanPackage)
        .map(requireTargetHead);
}

function mapTargetsByName(targets: readonly ReleaseTarget[]): ReadonlyMap<string, ReleaseTarget> {
    return new Map(
        targets.map(function (target) {
            return [ target.name, target ];
        })
    );
}

function mergeTargets(
    ...targetGroups: readonly (readonly PublishedReleaseTarget[])[]
): readonly PublishedReleaseTarget[] {
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

async function publishTargets(
    deps: ReleaseHandlerDeps,
    planned: PlannedRelease,
    changedTargets: readonly ReleaseTarget[]
): Promise<readonly PublishedReleaseTarget[] | undefined> {
    if (changedTargets.length === 0) {
        return [];
    }
    const changedTargetsByName = mapTargetsByName(changedTargets);
    const outcome = await deps.packtory.buildAndPublishAll(planned.config, {
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
            requireTargetHead({
                name: result.bundle.name,
                version: result.bundle.version,
                tagName: `${result.bundle.name}@${result.bundle.version}`,
                targetHead: plannedTarget.targetHead
            })
        ];
    });
}

async function createGitHubClientAsync(deps: ReleaseHandlerDeps): Promise<GitHubReleaseClient> {
    const token = readGitHubToken(deps);
    if (token === undefined) {
        throw new Error('GH_TOKEN or GITHUB_TOKEN must be set to create release tags or GitHub releases');
    }
    return deps.createGitHubReleaseClient({ ...parseGitHubRepositoryParts(await deps.readPackageInfo()), token });
}

async function ensureTags(client: GitHubReleaseClient, targets: readonly PublishedReleaseTarget[]): Promise<void> {
    for (const target of targets) {
        await client.ensureAnnotatedTag({
            tagName: target.tagName,
            message: target.tagName,
            targetHead: target.targetHead
        });
    }
}

async function createGitHubReleases(
    deps: ReleaseHandlerDeps,
    client: GitHubReleaseClient,
    planned: PlannedRelease,
    targets: readonly PublishedReleaseTarget[]
): Promise<void> {
    const changelog = await generateRequiredChangelog(deps, planned.config, planned.packages);
    const releaseNotesByPackageName = await collectGitHubReleaseNotes(
        deps,
        changelog.config,
        targets,
        changelog.changelog
    );
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

async function finishReleaseActions(
    deps: ReleaseHandlerDeps,
    planned: PlannedRelease,
    publishedTargets: readonly PublishedReleaseTarget[]
): Promise<void> {
    const releaseTargets = mergeTargets(publishedTargets, selectCurrentHeadPublishedTargets(planned.packages));
    if (releaseTargets.length === 0) {
        return;
    }
    if (!deps.flags.tag && !deps.flags.githubRelease) {
        return;
    }
    const client = await createGitHubClientAsync(deps);
    await ensureTags(client, releaseTargets);
    if (deps.flags.githubRelease) {
        await createGitHubReleases(deps, client, planned, releaseTargets);
    }
}

async function runMutatingRelease(deps: ReleaseHandlerDeps, planned: PlannedRelease): Promise<number> {
    const changedTargets = selectChangedTargets(planned.packages);
    assertTagRule(deps.flags, changedTargets);
    const publishedTargets = await publishTargets(deps, planned, changedTargets);
    if (publishedTargets === undefined) {
        return 1;
    }
    await finishReleaseActions(deps, planned, publishedTargets);
    deps.log(releaseCompletedMessage);
    return 0;
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
