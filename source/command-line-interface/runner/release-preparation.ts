import type {
    PullRequestLogConfiguration,
    PullRequestLogEngine,
    PullRequestLogEngineOptions
} from '../../changelog/pull-request-log.ts';
import type { Packtory, ReleasePlanPackage } from '../../packtory/packtory.ts';
import { generateChangelogOutputs, type GeneratedChangelog } from '../../packtory/packtory-changelog.ts';
import {
    collectChangelogSourceFileRoots,
    collectGeneratedAttributionPaths,
    createChangelogGenerationOptions,
    parseValidConfiguration,
    buildConfiguredChangelogFiles,
    type WrittenChangelogFile
} from './changelog-destinations.ts';
import { formatGitHubRepositoryName } from './github-repository.ts';
import { printReleasePlanFailure } from './release-plan-result-printing.ts';

type Logger = (message: string) => void;
type EnvironmentVariableName = 'GH_TOKEN' | 'GITHUB_TOKEN';
type ValidChangelogConfiguration = NonNullable<ReturnType<typeof parseValidConfiguration>>;

export type ReleaseChangelog = {
    readonly changelog: GeneratedChangelog;
    readonly configuration: ValidChangelogConfiguration;
    readonly engine: PullRequestLogEngine;
};
export type PlannedRelease = {
    readonly configuration: unknown;
    readonly packages: readonly ReleasePlanPackage[];
};
export type ReleasePreparationDependencies = {
    readonly createPullRequestLogEngine: (options: Readonly<PullRequestLogEngineOptions>) => PullRequestLogEngine;
    readonly currentDate: () => Date;
    readonly fileManager: {
        readonly readFile: (filePath: string) => Promise<string>;
    };
    readonly log: Logger;
    readonly packtory: Packtory;
    readonly readEnvironmentVariable: (name: EnvironmentVariableName) => string | undefined;
    readonly readPackageInformation: () => Promise<Readonly<Record<string, unknown>>>;
    readonly spinnerRenderer: { readonly stopAll: () => void; };
    readonly configurationLoader: { readonly load: () => Promise<unknown>; };
    readonly trace: boolean;
    readonly workingDirectory: string;
};

function readGitHubToken(
    dependencies: Pick<ReleasePreparationDependencies, 'readEnvironmentVariable'>
): string | undefined {
    return dependencies.readEnvironmentVariable('GH_TOKEN') ?? dependencies.readEnvironmentVariable('GITHUB_TOKEN');
}

function createEngine(
    dependencies: ReleasePreparationDependencies,
    configuration: PullRequestLogConfiguration
): PullRequestLogEngine {
    return dependencies.createPullRequestLogEngine({
        githubToken: readGitHubToken(dependencies),
        workingDirectory: dependencies.workingDirectory,
        configuration
    });
}

async function planRelease(
    dependencies: ReleasePreparationDependencies,
    configuration: unknown
): Promise<readonly ReleasePlanPackage[] | undefined> {
    const outcome = await dependencies.packtory.planReleaseAgainstLatestPublished(configuration);
    dependencies.spinnerRenderer.stopAll();
    if (outcome.result.isErr) {
        printReleasePlanFailure(dependencies.log, outcome.result.error, dependencies.trace);
        return undefined;
    }
    return outcome.result.value.packages;
}

export async function loadPlannedRelease(
    dependencies: ReleasePreparationDependencies
): Promise<PlannedRelease | undefined> {
    const configuration = await dependencies.configurationLoader.load();
    const packages = await planRelease(dependencies, configuration);
    if (packages === undefined) {
        return undefined;
    }
    return { configuration, packages };
}

function parseRequiredChangelogConfiguration(configuration: unknown): ValidChangelogConfiguration {
    const validConfiguration = parseValidConfiguration(configuration);
    if (validConfiguration === undefined) {
        throw new Error('The loaded config is invalid for changelog generation');
    }
    return validConfiguration;
}

async function generateReleaseChangelog(
    dependencies: ReleasePreparationDependencies,
    configuration: ValidChangelogConfiguration,
    packages: readonly ReleasePlanPackage[]
): Promise<ReleaseChangelog> {
    const packageInformation = await dependencies.readPackageInformation();
    const generationOptions = createChangelogGenerationOptions(configuration);
    const engine = createEngine(dependencies, generationOptions.pullRequestLogConfiguration);
    const changelog = await generateChangelogOutputs({
        packages,
        pullRequestLogEngine: engine,
        changelogSourceFileRootsByPackageName: collectChangelogSourceFileRoots(dependencies, configuration),
        explicitBaseReference: generationOptions.explicitBaseReference,
        githubRepository: formatGitHubRepositoryName(packageInformation),
        ignoredAttributionPaths: collectGeneratedAttributionPaths(dependencies, configuration),
        currentDate: dependencies.currentDate(),
        packageTagFormat: generationOptions.packageTagFormat,
        pullRequestLogConfiguration: generationOptions.pullRequestLogConfiguration,
        targetScopedLabelPattern: generationOptions.targetScopedLabelPattern
    });
    return { changelog, configuration, engine };
}

export async function generateRequiredChangelog(
    dependencies: ReleasePreparationDependencies,
    configuration: unknown,
    packages: readonly ReleasePlanPackage[]
): Promise<ReleaseChangelog> {
    return generateReleaseChangelog(dependencies, parseRequiredChangelogConfiguration(configuration), packages);
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
    log: Logger,
    changelog: GeneratedChangelog,
    writtenPaths: readonly string[],
    requireWrittenChangelog: boolean
): void {
    if (writtenPaths.length > 0) {
        return;
    }
    const message = formatEmptyChangelogMessage(changelog);
    if (requireWrittenChangelog) {
        throw new Error(message);
    }
    log(message);
}

export async function prepareReleaseChangelogs(
    dependencies: ReleasePreparationDependencies,
    planned: PlannedRelease,
    requireWrittenChangelog: boolean
): Promise<{
    readonly changelog: ReleaseChangelog;
    readonly writtenFiles: readonly WrittenChangelogFile[];
    readonly writtenPaths: readonly string[];
}> {
    const validConfiguration = parseRequiredChangelogConfiguration(planned.configuration);
    const changelog = await generateReleaseChangelog(dependencies, validConfiguration, planned.packages);
    const writtenFiles = await buildConfiguredChangelogFiles(
        dependencies,
        changelog.configuration,
        changelog.engine,
        changelog.changelog
    );
    const writtenPaths = writtenFiles.map(function (file) {
        return file.filePath;
    });
    reportUnwrittenChangelogs(dependencies.log, changelog.changelog, writtenPaths, requireWrittenChangelog);
    return { changelog, writtenFiles, writtenPaths };
}
