import type { PrLogConfig, PrLogEngine, PrLogEngineOptions } from '@pr-log/core';
import type { Packtory, ReleasePlanPackage } from '../../packtory/packtory.ts';
import { generateChangelogOutputs, type GeneratedChangelog } from '../../packtory/packtory-changelog.ts';
import {
    collectGeneratedAttributionPaths,
    createChangelogGenerationOptions,
    parseValidConfig,
    buildConfiguredChangelogFiles,
    type WrittenChangelogFile
} from './changelog-destinations.ts';
import { formatGitHubRepositoryName } from './github-repository.ts';
import { printReleasePlanFailure } from './release-plan-result-printing.ts';

type Logger = (message: string) => void;
type EnvironmentVariableName = 'GH_TOKEN' | 'GITHUB_TOKEN';
type ValidChangelogConfig = NonNullable<ReturnType<typeof parseValidConfig>>;

export type ReleaseChangelog = {
    readonly changelog: GeneratedChangelog;
    readonly config: ValidChangelogConfig;
    readonly engine: PrLogEngine;
};
export type PlannedRelease = {
    readonly config: unknown;
    readonly packages: readonly ReleasePlanPackage[];
};
export type ReleasePreparationDeps = {
    readonly createPrLogEngine: (options: Readonly<PrLogEngineOptions>) => PrLogEngine;
    readonly currentDate: () => Date;
    readonly fileManager: {
        readonly readFile: (filePath: string) => Promise<string>;
    };
    readonly log: Logger;
    readonly packtory: Packtory;
    readonly readEnvironmentVariable: (name: EnvironmentVariableName) => string | undefined;
    readonly readPackageInfo: () => Promise<Readonly<Record<string, unknown>>>;
    readonly spinnerRenderer: { readonly stopAll: () => void; };
    readonly configLoader: { readonly load: () => Promise<unknown>; };
    readonly workingDirectory: string;
};

function readGitHubToken(deps: Pick<ReleasePreparationDeps, 'readEnvironmentVariable'>): string | undefined {
    return deps.readEnvironmentVariable('GH_TOKEN') ?? deps.readEnvironmentVariable('GITHUB_TOKEN');
}

function createEngine(deps: ReleasePreparationDeps, config: PrLogConfig): PrLogEngine {
    return deps.createPrLogEngine({
        githubToken: readGitHubToken(deps),
        workingDirectory: deps.workingDirectory,
        config
    });
}

async function planRelease(
    deps: ReleasePreparationDeps,
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

export async function loadPlannedRelease(deps: ReleasePreparationDeps): Promise<PlannedRelease | undefined> {
    const config = await deps.configLoader.load();
    const packages = await planRelease(deps, config);
    if (packages === undefined) {
        return undefined;
    }
    return { config, packages };
}

function parseRequiredChangelogConfig(config: unknown): ValidChangelogConfig {
    const validConfig = parseValidConfig(config);
    if (validConfig === undefined) {
        throw new Error('The loaded config is invalid for changelog generation');
    }
    return validConfig;
}

async function generateReleaseChangelog(
    deps: ReleasePreparationDeps,
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

export async function generateRequiredChangelog(
    deps: ReleasePreparationDeps,
    config: unknown,
    packages: readonly ReleasePlanPackage[]
): Promise<ReleaseChangelog> {
    return generateReleaseChangelog(deps, parseRequiredChangelogConfig(config), packages);
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
    deps: ReleasePreparationDeps,
    planned: PlannedRelease,
    requireWrittenChangelog: boolean
): Promise<{
    readonly changelog: ReleaseChangelog;
    readonly writtenFiles: readonly WrittenChangelogFile[];
    readonly writtenPaths: readonly string[];
}> {
    const validConfig = parseRequiredChangelogConfig(planned.config);
    const changelog = await generateReleaseChangelog(deps, validConfig, planned.packages);
    const writtenFiles = await buildConfiguredChangelogFiles(
        deps,
        changelog.config,
        changelog.engine,
        changelog.changelog
    );
    const writtenPaths = writtenFiles.map(function (file) {
        return file.filePath;
    });
    reportUnwrittenChangelogs(deps.log, changelog.changelog, writtenPaths, requireWrittenChangelog);
    return { changelog, writtenFiles, writtenPaths };
}
