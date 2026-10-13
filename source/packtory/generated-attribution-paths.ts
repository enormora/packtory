import path from 'node:path';
import type { ChangelogOutput } from '../configuration/changelog-settings.ts';

type PackagePathConfiguration = {
    readonly name: string;
    readonly sourcesFolder?: string | undefined;
};

type ChangelogSettingsConfiguration = {
    readonly outputs?: readonly ChangelogOutput[] | undefined;
};

export type GeneratedAttributionPathConfiguration = {
    readonly changelog?: ChangelogSettingsConfiguration | undefined;
    readonly commonPackageSettings?: { readonly sourcesFolder?: string | undefined; } | undefined;
    readonly packages: readonly PackagePathConfiguration[];
};

type FileChangelogOutput = Extract<ChangelogOutput, { readonly kind: 'package-file' | 'repository-file'; }>;
type PackageChangelogOutput = Extract<ChangelogOutput, { readonly kind: 'package-file'; }>;
type PackageChangelogOutputWithExplicitPaths = PackageChangelogOutput & {
    readonly paths: Readonly<Record<string, string>>;
};

function normalizeConfiguredPath(filePath: string): string {
    return filePath.split(/[/\\]/u).join(path.sep);
}

function resolveRepositoryPath(repositoryFolder: string, filePath: string): string {
    return path.resolve(repositoryFolder, normalizeConfiguredPath(filePath));
}

function resolvePackageSourcesFolder(
    packageConfiguration: PackagePathConfiguration,
    configuration: GeneratedAttributionPathConfiguration
): string {
    const sourcesFolder = packageConfiguration.sourcesFolder ?? configuration.commonPackageSettings?.sourcesFolder;
    if (sourcesFolder === undefined) {
        throw new Error(`Config for package "${packageConfiguration.name}" is missing the sources folder`);
    }
    return sourcesFolder;
}

function resolvePackageFilePath(
    repositoryFolder: string,
    configuration: GeneratedAttributionPathConfiguration,
    packageConfiguration: PackagePathConfiguration,
    outputPath: string
): string {
    return path.resolve(
        repositoryFolder,
        normalizeConfiguredPath(resolvePackageSourcesFolder(packageConfiguration, configuration)),
        normalizeConfiguredPath(outputPath)
    );
}

function hasExplicitPackagePaths(output: PackageChangelogOutput): output is PackageChangelogOutputWithExplicitPaths {
    return Object.hasOwn(output, 'paths');
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
    configuration: GeneratedAttributionPathConfiguration
): readonly string[] {
    if (configuration.changelog?.outputs === undefined) {
        return [];
    }

    const paths = configuration
        .changelog
        .outputs
        .filter(function (output): output is FileChangelogOutput {
            return output.kind !== 'github-release';
        })
        .flatMap(function (output) {
            if (output.kind === 'repository-file') {
                return [ resolveRepositoryPath(repositoryFolder, output.path) ];
            }
            if (hasExplicitPackagePaths(output)) {
                return Object.values(output.paths).map(function (outputPath) {
                    return resolveRepositoryPath(repositoryFolder, outputPath);
                });
            }
            return configuration.packages.map(function (packageConfiguration) {
                return resolvePackageFilePath(repositoryFolder, configuration, packageConfiguration, output.path);
            });
        });
    return Array.from(
        new Set(
            paths.flatMap(function (filePath) {
                const relativePath = resolveRepositoryRelativePath(repositoryFolder, filePath);
                return relativePath === undefined ? [] : [ relativePath ];
            })
        )
    );
}
