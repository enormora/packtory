import path from 'node:path';
import type { PrLogConfig, PrLogEngine } from '@pr-log/core';
import type { z } from 'zod/mini';
import { safeParse } from '../../common/schema-validation.ts';
import type { ChangelogOutput, ChangelogSettings } from '../../config/changelog-settings.ts';
import { packtoryConfigSchema } from '../../config/packtory-config-schema.ts';
import type { FileManager } from '../../file-manager/file-manager.ts';
import * as generatedAttributionPaths from '../../packtory/generated-attribution-paths.ts';
import type { GeneratedChangelog } from '../../packtory/packtory-changelog.ts';
import { createPrLogConfig } from './changelog-pr-log-config.ts';

type PackagePathConfig = {
    readonly name: string;
    readonly sourcesFolder?: string | undefined;
};

type ParsedPacktoryConfig = Readonly<z.infer<typeof packtoryConfigSchema>>;

export type ChangelogConfig = {
    readonly changelog?: ChangelogSettings | undefined;
    readonly commonPackageSettings?: { readonly sourcesFolder?: string | undefined; } | undefined;
    readonly packages: readonly PackagePathConfig[];
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
    readonly explicitBaseRef: string | undefined;
    readonly packageTagFormat: string | undefined;
    readonly prLogConfig: PrLogConfig;
    readonly targetScopedLabelPattern: string | undefined;
};

function isPassThroughObject(value: unknown): boolean {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isChangelogSettings(changelog: ParsedPacktoryConfig['changelog']): changelog is ChangelogSettings | undefined {
    return changelog?.prLog === undefined || isPassThroughObject(changelog.prLog);
}

export function parseValidConfig(config: unknown): ChangelogConfig | undefined {
    const result = safeParse(packtoryConfigSchema, config);
    if (!result.success || !isChangelogSettings(result.data.changelog)) {
        return undefined;
    }
    return {
        changelog: result.data.changelog,
        commonPackageSettings: result.data.commonPackageSettings,
        packages: result.data.packages
    };
}

export function createChangelogGenerationOptions(config: ChangelogConfig): ChangelogGenerationOptions {
    return {
        explicitBaseRef: config.changelog?.explicitBaseRef,
        packageTagFormat: config.changelog?.packageTagFormat,
        prLogConfig: createPrLogConfig(config.changelog),
        targetScopedLabelPattern: config.changelog?.targetScopedLabelPattern
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

function resolvePackageSourcesFolder(packageConfig: PackagePathConfig, config: ChangelogConfig): string {
    const sourcesFolder = packageConfig.sourcesFolder ?? config.commonPackageSettings?.sourcesFolder;
    if (sourcesFolder === undefined) {
        throw new Error(`Config for package "${packageConfig.name}" is missing the sources folder`);
    }
    return sourcesFolder;
}

export function collectChangelogSourceFileRoots(
    dependencies: Pick<ChangelogDestinationDependencies, 'workingDirectory'>,
    config: ChangelogConfig
): ReadonlyMap<string, readonly string[]> {
    return new Map(
        config.packages.map(function (packageConfig) {
            const sourcesFolder = resolvePackageSourcesFolder(packageConfig, config);
            const absoluteSourceFolder = resolveRepositoryPath(dependencies, sourcesFolder);
            return [
                packageConfig.name,
                [ toRepositoryRelativePath(dependencies.workingDirectory, absoluteSourceFolder) ]
            ] as const;
        })
    );
}

function mapPackageConfigByName(config: ChangelogConfig): ReadonlyMap<string, PackagePathConfig> {
    return new Map(
        config.packages.map(function (packageConfig) {
            return [ packageConfig.name, packageConfig ];
        })
    );
}

function resolvePackageFilePath(
    dependencies: Pick<ChangelogDestinationDependencies, 'workingDirectory'>,
    config: ChangelogConfig,
    packageConfig: PackagePathConfig,
    outputPath: string
): string {
    return path.resolve(
        dependencies.workingDirectory,
        normalizeConfiguredPath(resolvePackageSourcesFolder(packageConfig, config)),
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
    config: ChangelogConfig
): readonly string[] {
    return generatedAttributionPaths.collectGeneratedAttributionPaths(dependencies.workingDirectory, config);
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
    config: ChangelogConfig,
    output: PackageChangelogOutputWithSharedPath,
    changelog: GeneratedChangelog
): readonly FileChangelogDestination[] {
    const packageConfigsByName = mapPackageConfigByName(config);
    return Array.from(changelog.packageMarkdownByName, function ([ packageName, generatedMarkdown ]) {
        const packageConfig = packageConfigsByName.get(packageName);
        if (packageConfig === undefined) {
            throw new Error(`Config for package "${packageName}" is missing`);
        }
        return {
            filePath: resolvePackageFilePath(dependencies, config, packageConfig, output.path),
            generatedMarkdown
        };
    });
}

function collectPackageOutputFilePathsWithSharedPath(
    dependencies: Pick<ChangelogDestinationDependencies, 'workingDirectory'>,
    config: ChangelogConfig,
    output: PackageChangelogOutputWithSharedPath
): readonly ChangelogOutputFilePath[] {
    return config.packages.map(function (packageConfig) {
        return {
            filePath: resolvePackageFilePath(dependencies, config, packageConfig, output.path),
            packageName: packageConfig.name
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
    config: ChangelogConfig,
    outputs: readonly ChangelogOutput[],
    changelog: GeneratedChangelog
): readonly FileChangelogDestination[] {
    return outputs.flatMap(function (output) {
        if (output.kind !== 'package-file') {
            return [];
        }
        if (hasSharedPackagePath(output)) {
            return collectPackageDestinationsWithSharedPath(dependencies, config, output, changelog);
        }
        return collectPackageDestinationsWithExplicitPaths(dependencies, output, changelog);
    });
}

function collectPackageOutputFilePaths(
    dependencies: Pick<ChangelogDestinationDependencies, 'workingDirectory'>,
    config: ChangelogConfig,
    outputs: readonly ChangelogOutput[]
): readonly ChangelogOutputFilePath[] {
    return outputs.flatMap(function (output) {
        if (output.kind !== 'package-file') {
            return [];
        }
        if (hasSharedPackagePath(output)) {
            return collectPackageOutputFilePathsWithSharedPath(dependencies, config, output);
        }
        return collectPackageOutputFilePathsWithExplicitPaths(dependencies, output);
    });
}

export function collectChangelogOutputFilePaths(
    dependencies: Pick<ChangelogDestinationDependencies, 'workingDirectory'>,
    config: ChangelogConfig
): readonly ChangelogOutputFilePath[] {
    const outputs = config.changelog?.outputs;
    if (outputs === undefined) {
        return [];
    }
    return [
        ...collectRepositoryOutputFilePaths(dependencies, outputs),
        ...collectPackageOutputFilePaths(dependencies, config, outputs)
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
    prLogEngine: Pick<PrLogEngine, 'updateChangelog'>,
    destination: FileChangelogDestination
): Promise<WrittenChangelogFile | undefined> {
    if (destination.generatedMarkdown.length === 0) {
        return undefined;
    }
    const existingChangelogMarkdownValue = await readChangelogMarkdown(dependencies.fileManager, destination.filePath);
    const content = prLogEngine.updateChangelog({
        existingChangelogMarkdown: existingChangelogMarkdownValue,
        generatedChangelogMarkdown: destination.generatedMarkdown
    });
    return { content, filePath: destination.filePath };
}

function collectChangelogDestinations(
    dependencies: Pick<ChangelogDestinationDependencies, 'workingDirectory'>,
    config: ChangelogConfig,
    changelog: GeneratedChangelog
): readonly FileChangelogDestination[] {
    const outputs = config.changelog?.outputs;
    if (outputs === undefined) {
        return [];
    }
    return [
        ...collectRepositoryDestinations(dependencies, outputs, changelog),
        ...collectPackageDestinations(dependencies, config, outputs, changelog)
    ];
}

export async function buildConfiguredChangelogFiles(
    dependencies: ChangelogDestinationDependencies,
    config: ChangelogConfig,
    prLogEngine: Pick<PrLogEngine, 'updateChangelog'>,
    changelog: GeneratedChangelog
): Promise<readonly WrittenChangelogFile[]> {
    const destinations = collectChangelogDestinations(dependencies, config, changelog);
    const writtenFiles: WrittenChangelogFile[] = [];
    for (const destination of destinations) {
        const writtenFile = await buildChangelogFile(dependencies, prLogEngine, destination);
        if (writtenFile !== undefined) {
            writtenFiles.push(writtenFile);
        }
    }
    return writtenFiles;
}

export async function writeConfiguredChangelogs(
    dependencies: WritableChangelogDestinationDependencies,
    config: ChangelogConfig,
    prLogEngine: Pick<PrLogEngine, 'updateChangelog'>,
    changelog: GeneratedChangelog
): Promise<readonly string[]> {
    const writtenFiles = await buildConfiguredChangelogFiles(dependencies, config, prLogEngine, changelog);
    for (const file of writtenFiles) {
        await dependencies.fileManager.writeFile(file.filePath, file.content);
    }
    return writtenFiles.map(function (file) {
        return file.filePath;
    });
}
