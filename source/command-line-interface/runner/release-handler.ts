import type { Packtory, ReleasePlanPackage } from '../../packtory/packtory.ts';
import { printPublishFailure } from './failure-printing.ts';
import type { GitHubReleaseClient } from './github-release-client.ts';
import { collectGitHubReleaseNotes, missingGitHubReleaseNotes } from './github-release-notes.ts';
import { parseGitHubRepositoryParts } from './github-repository.ts';
import {
    generateRequiredChangelog,
    loadPlannedRelease,
    type PlannedRelease,
    type ReleasePreparationDependencies
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

export type ReleaseHandlerDependencies = ReleasePreparationDependencies & {
    readonly createGitHubReleaseClient: (context: GitHubReleaseClientContext) => GitHubReleaseClient;
    readonly fileManager: ReleasePreparationDependencies['fileManager'];
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

function readGitHubToken(
    dependencies: Pick<ReleaseHandlerDependencies, 'readEnvironmentVariable'>
): string | undefined {
    return dependencies.readEnvironmentVariable('GH_TOKEN') ?? dependencies.readEnvironmentVariable('GITHUB_TOKEN');
}

async function publishTargets(
    dependencies: ReleaseHandlerDependencies,
    planned: PlannedRelease,
    changedTargets: readonly ReleaseTarget[]
): Promise<readonly PublishedReleaseTarget[] | undefined> {
    if (changedTargets.length === 0) {
        return [];
    }
    const changedTargetsByName = mapTargetsByName(changedTargets);
    const outcome = await dependencies.packtory.buildAndPublishAll(planned.config, {
        dryRun: false,
        stage: false,
        collectReport: false
    });
    dependencies.spinnerRenderer.stopAll();
    if (outcome.result.isErr) {
        printPublishFailure(dependencies.log, outcome.result.error, false);
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

async function createGitHubClientAsync(dependencies: ReleaseHandlerDependencies): Promise<GitHubReleaseClient> {
    const token = readGitHubToken(dependencies);
    if (token === undefined) {
        throw new Error('GH_TOKEN or GITHUB_TOKEN must be set to create release tags or GitHub releases');
    }
    return dependencies.createGitHubReleaseClient({
        ...parseGitHubRepositoryParts(await dependencies.readPackageInfo()),
        token
    });
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
    dependencies: ReleaseHandlerDependencies,
    client: GitHubReleaseClient,
    planned: PlannedRelease,
    targets: readonly PublishedReleaseTarget[]
): Promise<void> {
    const changelog = await generateRequiredChangelog(dependencies, planned.config, planned.packages);
    const releaseNotesByPackageName = await collectGitHubReleaseNotes(
        dependencies,
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

function reportFlagIssues(dependencies: ReleaseHandlerDependencies): number | undefined {
    const issues = collectFlagIssues(dependencies.flags);
    if (issues.length > 0) {
        dependencies.log(issues.join('\n'));
        return 1;
    }
    return undefined;
}

function resolvePlannedReleaseExitCode(
    dependencies: ReleaseHandlerDependencies,
    packages: readonly ReleasePlanPackage[]
): number | undefined {
    if (!hasAction(dependencies.flags)) {
        printReleasePlan(dependencies.log, packages);
        return 0;
    }
    if (!hasReleaseWork(dependencies.flags, packages)) {
        dependencies.log('No packages need release.');
        return 0;
    }
    return undefined;
}

async function finishReleaseActions(
    dependencies: ReleaseHandlerDependencies,
    planned: PlannedRelease,
    publishedTargets: readonly PublishedReleaseTarget[]
): Promise<void> {
    const releaseTargets = mergeTargets(publishedTargets, selectCurrentHeadPublishedTargets(planned.packages));
    if (releaseTargets.length === 0) {
        return;
    }
    if (!dependencies.flags.tag && !dependencies.flags.githubRelease) {
        return;
    }
    const client = await createGitHubClientAsync(dependencies);
    await ensureTags(client, releaseTargets);
    if (dependencies.flags.githubRelease) {
        await createGitHubReleases(dependencies, client, planned, releaseTargets);
    }
}

async function runMutatingRelease(dependencies: ReleaseHandlerDependencies, planned: PlannedRelease): Promise<number> {
    const changedTargets = selectChangedTargets(planned.packages);
    assertTagRule(dependencies.flags, changedTargets);
    const publishedTargets = await publishTargets(dependencies, planned, changedTargets);
    if (publishedTargets === undefined) {
        return 1;
    }
    await finishReleaseActions(dependencies, planned, publishedTargets);
    dependencies.log(releaseCompletedMessage);
    return 0;
}

async function runRelease(dependencies: ReleaseHandlerDependencies): Promise<number> {
    const flagExitCode = reportFlagIssues(dependencies);
    if (flagExitCode !== undefined) {
        return flagExitCode;
    }
    const planned = await loadPlannedRelease(dependencies);
    if (planned === undefined) {
        return 1;
    }
    return resolvePlannedReleaseExitCode(dependencies, planned.packages) ?? runMutatingRelease(dependencies, planned);
}

function stopSpinnersAndReturn(dependencies: ReleaseHandlerDependencies, exitCode: number): number {
    dependencies.spinnerRenderer.stopAll();
    return exitCode;
}

export async function runReleaseHandler(dependencies: ReleaseHandlerDependencies): Promise<number> {
    try {
        return stopSpinnersAndReturn(dependencies, await runRelease(dependencies));
    } catch (error: unknown) {
        dependencies.log(formatReleaseHandlerError(error));
        return stopSpinnersAndReturn(dependencies, 1);
    }
}
