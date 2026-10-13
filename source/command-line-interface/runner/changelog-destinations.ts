import path from 'node:path';
import type { PullRequestLogConfiguration, PullRequestLogEngine } from '../../changelog/pull-request-log.ts';
import { safeParse } from '../../common/schema-validation.ts';
import type { ChangelogOutput, ChangelogSettings } from '../../configuration/changelog-settings.ts';
import { packtoryConfigurationSchema } from '../../configuration/packtory-configuration-schema.ts';
import type { FileManager } from '../../file-manager/file-manager.ts';
import * as generatedAttributionPaths from '../../packtory/generated-attribution-paths.ts';
import type { GeneratedChangelog } from '../../packtory/packtory-changelog.ts';
import { createPullRequestLogConfiguration } from './changelog-pull-request-log-configuration.ts';

type PackagePathConfiguration = {
    readonly name: string;
    readonly sourcesFolder?: string | undefined;
};

export type ChangelogConfiguration = {
    readonly changelog?: ChangelogSettings | undefined;
    readonly commonPackageSettings?: { readonly sourcesFolder?: string | undefined; } | undefined;
    readonly packages: readonly PackagePathConfiguration[];
};

type ChangelogDestinationDependencies = {
    readonly fileManager: Pick<FileManager, 'readFile'>;
    readonly workingDirectory: string;
};
type WritableChangelogDestinationDependencies = {
    readonly fileManager: Pick<FileManager, 'readFile' | 'writeFile'>;
    readonly workingDirectory: string;
};

type FileChangelogDestination = {
    readonly filePath: string;
    readonly generatedMarkdown: string;
};
export type WrittenChangelogFile = {
    readonly content: string;
    readonly filePath: string;
};
type ChangelogOutputFilePath = {
    readonly filePath: string;
    readonly packageName: string | undefined;
};

type PackageChangelogOutput = Extract<ChangelogOutput, { readonly kind: 'package-file'; }>;
type PackageChangelogOutputWithSharedPath = PackageChangelogOutput & { readonly path: string; };
type PackageChangelogOutputWithExplicitPaths = PackageChangelogOutput & {
    readonly paths: Readonly<Record<string, string>>;
};
export type ChangelogGenerationOptions = {
    readonly explicitBaseReference: string | undefined;
    readonly packageTagFormat: string | undefined;
    readonly pullRequestLogConfiguration: PullRequestLogConfiguration;
    readonly targetScopedLabelPattern: string | undefined;
};

export function parseValidConfiguration(configuration: unknown): ChangelogConfiguration | undefined {
    const result = safeParse(packtoryConfigurationSchema, configuration);
    if (!result.success) {
        return undefined;
    }
    return {
        changelog: result.data.changelog,
        commonPackageSettings: result.data.commonPackageSettings,
        packages: result.data.packages
    };
}

export function createChangelogGenerationOptions(configuration: ChangelogConfiguration): ChangelogGenerationOptions {
    return {
        explicitBaseReference: configuration.changelog?.explicitBaseReference,
        packageTagFormat: configuration.changelog?.packageTagFormat,
        pullRequestLogConfiguration: createPullRequestLogConfiguration(configuration.changelog),
        targetScopedLabelPattern: configuration.changelog?.targetScopedLabelPattern
    };
}

function normalizeConfiguredPath(filePath: string): string {
    return filePath.split(/[/\\]/u).join(path.sep);
}

function resolveRepositoryPath(
    dependencies: Pick<ChangelogDestinationDependencies, 'workingDirectory'>,
    filePath: string
): string {
    return path.resolve(dependencies.workingDirectory, normalizeConfiguredPath(filePath));
}

function toRepositoryRelativePath(workingDirectory: string, filePath: string): string {
    return path.relative(workingDirectory, filePath).split(path.sep).join('/');
}

function resolvePackageSourcesFolder(
    packageConfiguration: PackagePathConfiguration,
    configuration: ChangelogConfiguration
): string {
    const sourcesFolder = packageConfiguration.sourcesFolder ?? configuration.commonPackageSettings?.sourcesFolder;
    if (sourcesFolder === undefined) {
        throw new Error(`Config for package "${packageConfiguration.name}" is missing the sources folder`);
    }
    return sourcesFolder;
}

export function collectChangelogSourceFileRoots(
    dependencies: Pick<ChangelogDestinationDependencies, 'workingDirectory'>,
    configuration: ChangelogConfiguration
): ReadonlyMap<string, readonly string[]> {
    return new Map(
        configuration.packages.map(function (packageConfiguration) {
            const sourcesFolder = resolvePackageSourcesFolder(packageConfiguration, configuration);
            const absoluteSourceFolder = resolveRepositoryPath(dependencies, sourcesFolder);
            return [
                packageConfiguration.name,
                [ toRepositoryRelativePath(dependencies.workingDirectory, absoluteSourceFolder) ]
            ] as const;
        })
    );
}

function mapPackageConfigurationByName(
    configuration: ChangelogConfiguration
): ReadonlyMap<string, PackagePathConfiguration> {
    return new Map(
        configuration.packages.map(function (packageConfiguration) {
            return [ packageConfiguration.name, packageConfiguration ];
        })
    );
}

function resolvePackageFilePath(
    dependencies: Pick<ChangelogDestinationDependencies, 'workingDirectory'>,
    configuration: ChangelogConfiguration,
    packageConfiguration: PackagePathConfiguration,
    outputPath: string
): string {
    return path.resolve(
        dependencies.workingDirectory,
        normalizeConfiguredPath(resolvePackageSourcesFolder(packageConfiguration, configuration)),
        normalizeConfiguredPath(outputPath)
    );
}

function resolveExplicitPackageFilePath(
    dependencies: Pick<ChangelogDestinationDependencies, 'workingDirectory'>,
    output: PackageChangelogOutputWithExplicitPaths,
    packageName: string
): string {
    const outputPath = output.paths[packageName];
    if (outputPath === undefined) {
        throw new Error(`Changelog output path for package "${packageName}" is missing`);
    }
    return resolveRepositoryPath(dependencies, outputPath);
}

function hasSharedPackagePath(output: PackageChangelogOutput): output is PackageChangelogOutputWithSharedPath {
    return Object.hasOwn(output, 'path');
}

export function collectGeneratedAttributionPaths(
    dependencies: Pick<ChangelogDestinationDependencies, 'workingDirectory'>,
    configuration: ChangelogConfiguration
): readonly string[] {
    return generatedAttributionPaths.collectGeneratedAttributionPaths(dependencies.workingDirectory, configuration);
}

export function shouldPageGroupedChangelog(outputs: readonly ChangelogOutput[] | undefined): boolean {
    return (
        outputs === undefined ||
        outputs.some(function (output) {
            return output.kind === 'github-release';
        })
    );
}

function collectRepositoryDestinations(
    dependencies: Pick<ChangelogDestinationDependencies, 'workingDirectory'>,
    outputs: readonly ChangelogOutput[],
    changelog: GeneratedChangelog
): readonly FileChangelogDestination[] {
    return outputs.flatMap(function (output) {
        if (output.kind !== 'repository-file') {
            return [];
        }
        return [ {
            filePath: resolveRepositoryPath(dependencies, output.path),
            generatedMarkdown: changelog.groupedMarkdown
        } ];
    });
}

function collectRepositoryOutputFilePaths(
    dependencies: Pick<ChangelogDestinationDependencies, 'workingDirectory'>,
    outputs: readonly ChangelogOutput[]
): readonly ChangelogOutputFilePath[] {
    return outputs.flatMap(function (output) {
        if (output.kind !== 'repository-file') {
            return [];
        }
        return [ { filePath: resolveRepositoryPath(dependencies, output.path), packageName: undefined } ];
    });
}

function collectPackageDestinationsWithSharedPath(
    dependencies: Pick<ChangelogDestinationDependencies, 'workingDirectory'>,
    configuration: ChangelogConfiguration,
    output: PackageChangelogOutputWithSharedPath,
    changelog: GeneratedChangelog
): readonly FileChangelogDestination[] {
    const packageConfigurationsByName = mapPackageConfigurationByName(configuration);
    return Array.from(changelog.packageMarkdownByName, function ([ packageName, generatedMarkdown ]) {
        const packageConfiguration = packageConfigurationsByName.get(packageName);
        if (packageConfiguration === undefined) {
            throw new Error(`Config for package "${packageName}" is missing`);
        }
        return {
            filePath: resolvePackageFilePath(dependencies, configuration, packageConfiguration, output.path),
            generatedMarkdown
        };
    });
}

function collectPackageOutputFilePathsWithSharedPath(
    dependencies: Pick<ChangelogDestinationDependencies, 'workingDirectory'>,
    configuration: ChangelogConfiguration,
    output: PackageChangelogOutputWithSharedPath
): readonly ChangelogOutputFilePath[] {
    return configuration.packages.map(function (packageConfiguration) {
        return {
            filePath: resolvePackageFilePath(dependencies, configuration, packageConfiguration, output.path),
            packageName: packageConfiguration.name
        };
    });
}

function collectPackageDestinationsWithExplicitPaths(
    dependencies: Pick<ChangelogDestinationDependencies, 'workingDirectory'>,
    output: PackageChangelogOutputWithExplicitPaths,
    changelog: GeneratedChangelog
): readonly FileChangelogDestination[] {
    return Array.from(changelog.packageMarkdownByName, function ([ packageName, generatedMarkdown ]) {
        return { filePath: resolveExplicitPackageFilePath(dependencies, output, packageName), generatedMarkdown };
    });
}

function collectPackageOutputFilePathsWithExplicitPaths(
    dependencies: Pick<ChangelogDestinationDependencies, 'workingDirectory'>,
    output: PackageChangelogOutputWithExplicitPaths
): readonly ChangelogOutputFilePath[] {
    return Object.entries(output.paths).map(function ([ packageName, outputPath ]) {
        return { filePath: resolveRepositoryPath(dependencies, outputPath), packageName };
    });
}

function collectPackageDestinations(
    dependencies: Pick<ChangelogDestinationDependencies, 'workingDirectory'>,
    configuration: ChangelogConfiguration,
    outputs: readonly ChangelogOutput[],
    changelog: GeneratedChangelog
): readonly FileChangelogDestination[] {
    return outputs.flatMap(function (output) {
        if (output.kind !== 'package-file') {
            return [];
        }
        if (hasSharedPackagePath(output)) {
            return collectPackageDestinationsWithSharedPath(dependencies, configuration, output, changelog);
        }
        return collectPackageDestinationsWithExplicitPaths(dependencies, output, changelog);
    });
}

function collectPackageOutputFilePaths(
    dependencies: Pick<ChangelogDestinationDependencies, 'workingDirectory'>,
    configuration: ChangelogConfiguration,
    outputs: readonly ChangelogOutput[]
): readonly ChangelogOutputFilePath[] {
    return outputs.flatMap(function (output) {
        if (output.kind !== 'package-file') {
            return [];
        }
        if (hasSharedPackagePath(output)) {
            return collectPackageOutputFilePathsWithSharedPath(dependencies, configuration, output);
        }
        return collectPackageOutputFilePathsWithExplicitPaths(dependencies, output);
    });
}

export function collectChangelogOutputFilePaths(
    dependencies: Pick<ChangelogDestinationDependencies, 'workingDirectory'>,
    configuration: ChangelogConfiguration
): readonly ChangelogOutputFilePath[] {
    const outputs = configuration.changelog?.outputs;
    if (outputs === undefined) {
        return [];
    }
    return [
        ...collectRepositoryOutputFilePaths(dependencies, outputs),
        ...collectPackageOutputFilePaths(dependencies, configuration, outputs)
    ];
}

function isMissingFileError(error: unknown): boolean {
    return Reflect.get(new Object(error), 'code') === 'ENOENT';
}

async function readChangelogMarkdown(fileManager: Pick<FileManager, 'readFile'>, filePath: string): Promise<string> {
    try {
        return await fileManager.readFile(filePath);
    } catch (error: unknown) {
        if (isMissingFileError(error)) {
            return '';
        }
        throw error;
    }
}

async function buildChangelogFile(
    dependencies: Pick<ChangelogDestinationDependencies, 'fileManager'>,
    pullRequestLogEngine: Pick<PullRequestLogEngine, 'updateChangelog'>,
    destination: FileChangelogDestination
): Promise<WrittenChangelogFile | undefined> {
    if (destination.generatedMarkdown.length === 0) {
        return undefined;
    }
    const existingChangelogMarkdownValue = await readChangelogMarkdown(dependencies.fileManager, destination.filePath);
    const content = pullRequestLogEngine.updateChangelog({
        existingChangelogMarkdown: existingChangelogMarkdownValue,
        generatedChangelogMarkdown: destination.generatedMarkdown
    });
    return { content, filePath: destination.filePath };
}

function collectChangelogDestinations(
    dependencies: Pick<ChangelogDestinationDependencies, 'workingDirectory'>,
    configuration: ChangelogConfiguration,
    changelog: GeneratedChangelog
): readonly FileChangelogDestination[] {
    const outputs = configuration.changelog?.outputs;
    if (outputs === undefined) {
        return [];
    }
    return [
        ...collectRepositoryDestinations(dependencies, outputs, changelog),
        ...collectPackageDestinations(dependencies, configuration, outputs, changelog)
    ];
}

export async function buildConfiguredChangelogFiles(
    dependencies: ChangelogDestinationDependencies,
    configuration: ChangelogConfiguration,
    pullRequestLogEngine: Pick<PullRequestLogEngine, 'updateChangelog'>,
    changelog: GeneratedChangelog
): Promise<readonly WrittenChangelogFile[]> {
    const destinations = collectChangelogDestinations(dependencies, configuration, changelog);
    const writtenFiles: WrittenChangelogFile[] = [];
    for (const destination of destinations) {
        const writtenFile = await buildChangelogFile(dependencies, pullRequestLogEngine, destination);
        if (writtenFile !== undefined) {
            writtenFiles.push(writtenFile);
        }
    }
    return writtenFiles;
}

export async function writeConfiguredChangelogs(
    dependencies: WritableChangelogDestinationDependencies,
    configuration: ChangelogConfiguration,
    pullRequestLogEngine: Pick<PullRequestLogEngine, 'updateChangelog'>,
    changelog: GeneratedChangelog
): Promise<readonly string[]> {
    const writtenFiles = await buildConfiguredChangelogFiles(
        dependencies,
        configuration,
        pullRequestLogEngine,
        changelog
    );
    for (const file of writtenFiles) {
        await dependencies.fileManager.writeFile(file.filePath, file.content);
    }
    return writtenFiles.map(function (file) {
        return file.filePath;
    });
}
