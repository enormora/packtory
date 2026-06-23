import path from 'node:path';
import type { ChangelogOutput } from '../config/changelog-settings.ts';

type PackagePathConfig = {
    readonly name: string;
    readonly sourcesFolder?: string | undefined;
};

type ChangelogSettingsConfig = {
    readonly outputs?: readonly ChangelogOutput[] | undefined;
};

export type GeneratedAttributionPathConfig = {
    readonly changelog?: ChangelogSettingsConfig | undefined;
    readonly commonPackageSettings?: { readonly sourcesFolder?: string | undefined } | undefined;
    readonly packages: readonly PackagePathConfig[];
};

type FileChangelogOutput = Extract<ChangelogOutput, { readonly kind: 'package-file' | 'repository-file' }>;
type PackageChangelogOutput = Extract<ChangelogOutput, { readonly kind: 'package-file' }>;
type PackageChangelogOutputWithExplicitPaths = PackageChangelogOutput & {
    readonly paths: Readonly<Record<string, string>>;
};

function normalizeConfiguredPath(filePath: string): string {
    return filePath.split(/[/\\]/u).join(path.sep);
}

function resolveRepositoryPath(repositoryFolder: string, filePath: string): string {
    return path.resolve(repositoryFolder, normalizeConfiguredPath(filePath));
}

function resolvePackageSourcesFolder(packageConfig: PackagePathConfig, config: GeneratedAttributionPathConfig): string {
    const sourcesFolder = packageConfig.sourcesFolder ?? config.commonPackageSettings?.sourcesFolder;
    if (sourcesFolder === undefined) {
        throw new Error(`Config for package "${packageConfig.name}" is missing the sources folder`);
    }
    return sourcesFolder;
}

function resolvePackageFilePath(
    repositoryFolder: string,
    config: GeneratedAttributionPathConfig,
    packageConfig: PackagePathConfig,
    outputPath: string
): string {
    return path.resolve(
        repositoryFolder,
        normalizeConfiguredPath(resolvePackageSourcesFolder(packageConfig, config)),
        normalizeConfiguredPath(outputPath)
    );
}

function hasExplicitPackagePaths(output: PackageChangelogOutput): output is PackageChangelogOutputWithExplicitPaths {
    return 'paths' in output;
}

function resolveRepositoryRelativePath(repositoryFolder: string, filePath: string): string | undefined {
    const relativePath = path.relative(repositoryFolder, filePath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        return undefined;
    }
    return relativePath.split(path.sep).join('/');
}

export function collectGeneratedAttributionPaths(
    repositoryFolder: string,
    config: GeneratedAttributionPathConfig
): readonly string[] {
    if (config.changelog?.outputs === undefined) {
        return [];
    }

    const paths = config.changelog.outputs
        .filter((output): output is FileChangelogOutput => {
            return output.kind !== 'github-release';
        })
        .flatMap((output) => {
            if (output.kind === 'repository-file') {
                return [resolveRepositoryPath(repositoryFolder, output.path)];
            }
            if (hasExplicitPackagePaths(output)) {
                return Object.values(output.paths).map((outputPath) => {
                    return resolveRepositoryPath(repositoryFolder, outputPath);
                });
            }
            return config.packages.map((packageConfig) => {
                return resolvePackageFilePath(repositoryFolder, config, packageConfig, output.path);
            });
        });
    return Array.from(
        new Set(
            paths.flatMap((filePath) => {
                const relativePath = resolveRepositoryRelativePath(repositoryFolder, filePath);
                return relativePath === undefined ? [] : [relativePath];
            })
        )
    );
}
