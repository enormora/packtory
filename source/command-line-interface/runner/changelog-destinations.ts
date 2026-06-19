import path from 'node:path';
import type { PrLogEngine } from '@pr-log/core';
import { safeParse } from '@schema-hub/zod-error-formatter';
import type { ChangelogOutput } from '../../config/changelog-settings.ts';
import { packtoryConfigSchema } from '../../config/packtory-config-schema.ts';
import type { FileManager } from '../../file-manager/file-manager.ts';
import type { GeneratedChangelog } from '../../packtory/packtory-changelog.ts';

type PackagePathConfig = {
    readonly name: string;
    readonly sourcesFolder?: string | undefined;
};

export type ChangelogConfig = {
    readonly changelog?: { readonly outputs: readonly ChangelogOutput[] } | undefined;
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

export function parseValidConfig(config: unknown): ChangelogConfig | undefined {
    const result = safeParse(packtoryConfigSchema, config);
    return result.success ? result.data : undefined;
}

function normalizedConfiguredPath(filePath: string): string {
    return filePath.split(/[/\\]/u).join(path.sep);
}

function repositoryPath(deps: Pick<ChangelogDestinationDeps, 'workingDirectory'>, filePath: string): string {
    return path.resolve(deps.workingDirectory, normalizedConfiguredPath(filePath));
}

function packageSourcesFolder(packageConfig: PackagePathConfig, config: ChangelogConfig): string {
    const sourcesFolder = packageConfig.sourcesFolder ?? config.commonPackageSettings?.sourcesFolder;
    if (sourcesFolder === undefined) {
        throw new Error(`Config for package "${packageConfig.name}" is missing the sources folder`);
    }
    return sourcesFolder;
}

function packageConfigByNameFrom(config: ChangelogConfig): ReadonlyMap<string, PackagePathConfig> {
    return new Map(
        config.packages.map((packageConfig) => {
            return [packageConfig.name, packageConfig];
        })
    );
}

function packageFilePath(
    deps: Pick<ChangelogDestinationDeps, 'workingDirectory'>,
    config: ChangelogConfig,
    packageConfig: PackagePathConfig,
    outputPath: string
): string {
    return path.resolve(
        deps.workingDirectory,
        normalizedConfiguredPath(packageSourcesFolder(packageConfig, config)),
        normalizedConfiguredPath(outputPath)
    );
}

function repositoryRelativePath(
    deps: Pick<ChangelogDestinationDeps, 'workingDirectory'>,
    filePath: string
): string | undefined {
    const relativePath = path.relative(deps.workingDirectory, filePath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        return undefined;
    }
    return relativePath.split(path.sep).join('/');
}

export function generatedAttributionPaths(
    deps: Pick<ChangelogDestinationDeps, 'workingDirectory'>,
    config: ChangelogConfig
): readonly string[] {
    if (config.changelog === undefined) {
        return [];
    }

    const paths = config.changelog.outputs
        .filter((output): output is FileChangelogOutput => {
            return output.kind !== 'github-release';
        })
        .flatMap((output) => {
            if (output.kind === 'repository-file') {
                return [repositoryPath(deps, output.path)];
            }
            return config.packages.map((packageConfig) => {
                return packageFilePath(deps, config, packageConfig, output.path);
            });
        });
    return Array.from(
        new Set(
            paths.flatMap((filePath) => {
                const relativePath = repositoryRelativePath(deps, filePath);
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

function repositoryDestinations(
    deps: Pick<ChangelogDestinationDeps, 'workingDirectory'>,
    outputs: readonly ChangelogOutput[],
    changelog: GeneratedChangelog
): readonly FileChangelogDestination[] {
    return outputs.flatMap((output) => {
        if (output.kind !== 'repository-file') {
            return [];
        }
        return [{ filePath: repositoryPath(deps, output.path), generatedMarkdown: changelog.groupedMarkdown }];
    });
}

function packageDestinations(
    deps: Pick<ChangelogDestinationDeps, 'workingDirectory'>,
    config: ChangelogConfig,
    outputs: readonly ChangelogOutput[],
    changelog: GeneratedChangelog
): readonly FileChangelogDestination[] {
    const packageConfigsByName = packageConfigByNameFrom(config);
    return outputs.flatMap((output) => {
        if (output.kind !== 'package-file') {
            return [];
        }
        return Array.from(changelog.packageMarkdownByName).flatMap(([packageName, generatedMarkdown]) => {
            const packageConfig = packageConfigsByName.get(packageName);
            if (packageConfig === undefined) {
                throw new Error(`Config for package "${packageName}" is missing`);
            }
            return [{ filePath: packageFilePath(deps, config, packageConfig, output.path), generatedMarkdown }];
        });
    });
}

function isMissingFileError(error: unknown): boolean {
    return Reflect.get(new Object(error), 'code') === 'ENOENT';
}

async function existingChangelogMarkdown(
    fileManager: Pick<FileManager, 'readFile'>,
    filePath: string
): Promise<string> {
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
): Promise<void> {
    if (destination.generatedMarkdown.length === 0) {
        return;
    }
    const existingChangelogMarkdownValue = await existingChangelogMarkdown(deps.fileManager, destination.filePath);
    await deps.fileManager.writeFile(
        destination.filePath,
        prLogEngine.updateChangelog({
            existingChangelogMarkdown: existingChangelogMarkdownValue,
            generatedChangelogMarkdown: destination.generatedMarkdown
        })
    );
}

export async function writeConfiguredChangelogs(
    deps: ChangelogDestinationDeps,
    config: ChangelogConfig,
    prLogEngine: Pick<PrLogEngine, 'updateChangelog'>,
    changelog: GeneratedChangelog
): Promise<void> {
    if (config.changelog === undefined) {
        return;
    }

    const { outputs } = config.changelog;
    const destinations = [
        ...repositoryDestinations(deps, outputs, changelog),
        ...packageDestinations(deps, config, outputs, changelog)
    ];
    for (const destination of destinations) {
        await writeChangelogDestination(deps, prLogEngine, destination);
    }
}
