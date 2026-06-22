import path from 'node:path';
import { defaultValidLabels, type PrLogEngine } from '@pr-log/core';
import { safeParse } from '@schema-hub/zod-error-formatter';
import type { ChangelogOutput } from '../../config/changelog-settings.ts';
import { packtoryConfigSchema } from '../../config/packtory-config-schema.ts';
import type { FileManager } from '../../file-manager/file-manager.ts';
import type { GeneratedChangelog } from '../../packtory/packtory-changelog.ts';

type PackagePathConfig = {
    readonly name: string;
    readonly sourcesFolder?: string | undefined;
};

type ChangelogSettingsConfig = {
    readonly explicitBaseRef?: string | undefined;
    readonly labels?: Readonly<Record<string, string>> | undefined;
    readonly outputs?: readonly ChangelogOutput[] | undefined;
    readonly packageTagFormat?: string | undefined;
    readonly targetScopedLabelPattern?: string | undefined;
};

export type ChangelogConfig = {
    readonly changelog?: ChangelogSettingsConfig | undefined;
    readonly commonPackageSettings?: { readonly sourcesFolder?: string | undefined } | undefined;
    readonly packages: readonly PackagePathConfig[];
};

type ChangelogDestinationDeps = {
    readonly fileManager: Pick<FileManager, 'readFile' | 'writeFile'>;
    readonly workingDirectory: string;
};

type FileChangelogDestination = {
    readonly filePath: string;
    readonly generatedMarkdown: string;
};

type FileChangelogOutput = Extract<ChangelogOutput, { readonly kind: 'package-file' | 'repository-file' }>;
export type ChangelogGenerationOptions = {
    readonly explicitBaseRef: string | undefined;
    readonly packageTagFormat: string | undefined;
    readonly targetScopedLabelPattern: string | undefined;
    readonly validLabels: ReadonlyMap<string, string>;
};

export function parseValidConfig(config: unknown): ChangelogConfig | undefined {
    const result = safeParse(packtoryConfigSchema, config);
    return result.success ? result.data : undefined;
}

export function createChangelogGenerationOptions(config: ChangelogConfig): ChangelogGenerationOptions {
    return {
        explicitBaseRef: config.changelog?.explicitBaseRef,
        packageTagFormat: config.changelog?.packageTagFormat,
        targetScopedLabelPattern: config.changelog?.targetScopedLabelPattern,
        validLabels: new Map([...defaultValidLabels, ...Object.entries(config.changelog?.labels ?? {})])
    };
}

function normalizeConfiguredPath(filePath: string): string {
    return filePath.split(/[/\\]/u).join(path.sep);
}

function resolveRepositoryPath(deps: Pick<ChangelogDestinationDeps, 'workingDirectory'>, filePath: string): string {
    return path.resolve(deps.workingDirectory, normalizeConfiguredPath(filePath));
}

function resolvePackageSourcesFolder(packageConfig: PackagePathConfig, config: ChangelogConfig): string {
    const sourcesFolder = packageConfig.sourcesFolder ?? config.commonPackageSettings?.sourcesFolder;
    if (sourcesFolder === undefined) {
        throw new Error(`Config for package "${packageConfig.name}" is missing the sources folder`);
    }
    return sourcesFolder;
}

function mapPackageConfigByName(config: ChangelogConfig): ReadonlyMap<string, PackagePathConfig> {
    return new Map(
        config.packages.map((packageConfig) => {
            return [packageConfig.name, packageConfig];
        })
    );
}

function resolvePackageFilePath(
    deps: Pick<ChangelogDestinationDeps, 'workingDirectory'>,
    config: ChangelogConfig,
    packageConfig: PackagePathConfig,
    outputPath: string
): string {
    return path.resolve(
        deps.workingDirectory,
        normalizeConfiguredPath(resolvePackageSourcesFolder(packageConfig, config)),
        normalizeConfiguredPath(outputPath)
    );
}

function resolveRepositoryRelativePath(
    deps: Pick<ChangelogDestinationDeps, 'workingDirectory'>,
    filePath: string
): string | undefined {
    const relativePath = path.relative(deps.workingDirectory, filePath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        return undefined;
    }
    return relativePath.split(path.sep).join('/');
}

export function collectGeneratedAttributionPaths(
    deps: Pick<ChangelogDestinationDeps, 'workingDirectory'>,
    config: ChangelogConfig
): readonly string[] {
    if (config.changelog === undefined) {
        return [];
    }
    if (config.changelog.outputs === undefined) {
        return [];
    }

    const paths = config.changelog.outputs
        .filter((output): output is FileChangelogOutput => {
            return output.kind !== 'github-release';
        })
        .flatMap((output) => {
            if (output.kind === 'repository-file') {
                return [resolveRepositoryPath(deps, output.path)];
            }
            return config.packages.map((packageConfig) => {
                return resolvePackageFilePath(deps, config, packageConfig, output.path);
            });
        });
    return Array.from(
        new Set(
            paths.flatMap((filePath) => {
                const relativePath = resolveRepositoryRelativePath(deps, filePath);
                return relativePath === undefined ? [] : [relativePath];
            })
        )
    );
}

export function shouldPageGroupedChangelog(outputs: readonly ChangelogOutput[] | undefined): boolean {
    return (
        outputs === undefined ||
        outputs.some((output) => {
            return output.kind === 'github-release';
        })
    );
}

function collectRepositoryDestinations(
    deps: Pick<ChangelogDestinationDeps, 'workingDirectory'>,
    outputs: readonly ChangelogOutput[],
    changelog: GeneratedChangelog
): readonly FileChangelogDestination[] {
    return outputs.flatMap((output) => {
        if (output.kind !== 'repository-file') {
            return [];
        }
        return [{ filePath: resolveRepositoryPath(deps, output.path), generatedMarkdown: changelog.groupedMarkdown }];
    });
}

function collectPackageDestinations(
    deps: Pick<ChangelogDestinationDeps, 'workingDirectory'>,
    config: ChangelogConfig,
    outputs: readonly ChangelogOutput[],
    changelog: GeneratedChangelog
): readonly FileChangelogDestination[] {
    const packageConfigsByName = mapPackageConfigByName(config);
    return outputs.flatMap((output) => {
        if (output.kind !== 'package-file') {
            return [];
        }
        return Array.from(changelog.packageMarkdownByName).flatMap(([packageName, generatedMarkdown]) => {
            const packageConfig = packageConfigsByName.get(packageName);
            if (packageConfig === undefined) {
                throw new Error(`Config for package "${packageName}" is missing`);
            }
            return [{ filePath: resolvePackageFilePath(deps, config, packageConfig, output.path), generatedMarkdown }];
        });
    });
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

async function writeChangelogDestination(
    deps: Pick<ChangelogDestinationDeps, 'fileManager'>,
    prLogEngine: Pick<PrLogEngine, 'updateChangelog'>,
    destination: FileChangelogDestination
): Promise<string | undefined> {
    if (destination.generatedMarkdown.length === 0) {
        return undefined;
    }
    const existingChangelogMarkdownValue = await readChangelogMarkdown(deps.fileManager, destination.filePath);
    await deps.fileManager.writeFile(
        destination.filePath,
        prLogEngine.updateChangelog({
            existingChangelogMarkdown: existingChangelogMarkdownValue,
            generatedChangelogMarkdown: destination.generatedMarkdown
        })
    );
    return destination.filePath;
}

function collectChangelogDestinations(
    deps: Pick<ChangelogDestinationDeps, 'workingDirectory'>,
    config: ChangelogConfig,
    changelog: GeneratedChangelog
): readonly FileChangelogDestination[] {
    const outputs = config.changelog?.outputs;
    if (outputs === undefined) {
        return [];
    }
    return [
        ...collectRepositoryDestinations(deps, outputs, changelog),
        ...collectPackageDestinations(deps, config, outputs, changelog)
    ];
}

export async function writeConfiguredChangelogs(
    deps: ChangelogDestinationDeps,
    config: ChangelogConfig,
    prLogEngine: Pick<PrLogEngine, 'updateChangelog'>,
    changelog: GeneratedChangelog
): Promise<readonly string[]> {
    const destinations = collectChangelogDestinations(deps, config, changelog);
    const writtenPaths: string[] = [];
    for (const destination of destinations) {
        const writtenPath = await writeChangelogDestination(deps, prLogEngine, destination);
        if (writtenPath !== undefined) {
            writtenPaths.push(writtenPath);
        }
    }
    return writtenPaths;
}
