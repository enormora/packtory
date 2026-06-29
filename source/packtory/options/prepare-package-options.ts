import type { PackageConfig, PackageConfigsByName, PacktoryConfigWithoutRegistry } from '../../config/config.ts';
import type { AdditionalPackageJsonAttributes, MainPackageJson } from '../../config/package-json.ts';
import type { DeadCodeEliminationSettings } from '../../config/dead-code-elimination-settings.ts';
import type { ResourceResolveOptions } from '../../resource-resolver/resource-resolve-options.ts';
import { normalizeRoot } from '../normalize-paths.ts';
import { resolveBundleDependencies } from './bundle-dependency-resolution.ts';
import { getRequiredArrayValue, mapRequiredArrayValue } from './required-value-helpers.ts';
import {
    buildAdditionalPackageJsonAttributes,
    resolveAdditionalFiles,
    resolveAdditionalChangelogSourceFiles,
    resolveAllowMutableSpecifiers,
    resolveDeadCodeElimination,
    resolveIncludeSourceMapFiles,
    resolveMainPackageJson,
    resolveSourcesFolder,
    type AdditionalChangelogSourceFiles
} from './setting-resolvers.ts';
import { resolveSurface } from './surface-resolution.ts';

export type VersioningSettings = NonNullable<PackageConfig['versioning']>;

type ManifestOptionsSubset = {
    readonly additionalPackageJsonAttributes: AdditionalPackageJsonAttributes;
    readonly allowMutableSpecifiers: readonly string[];
    readonly mainPackageJson: MainPackageJson;
};

export type SharedPackageOptions<TBundle extends { name: string }> = ManifestOptionsSubset &
    ResourceResolveOptions & {
        readonly bundleDependencies: readonly TBundle[];
        readonly bundlePeerDependencies: readonly TBundle[];
        readonly deadCodeElimination?: DeadCodeEliminationSettings | undefined;
    };

export type PreparedPackageOptions<TBundle extends { name: string }> = {
    readonly additionalChangelogSourceFiles: AdditionalChangelogSourceFiles;
    readonly packageConfig: PackageConfig;
    readonly sharedOptions: SharedPackageOptions<TBundle>;
    readonly versioning: VersioningSettings;
};

function getPackageConfig(packageName: string, packageConfigs: PackageConfigsByName): PackageConfig {
    const packageConfig = packageConfigs[packageName];
    if (packageConfig === undefined) {
        throw new Error(`Config for package "${packageName}" is missing`);
    }
    return packageConfig;
}

function buildSharedOptions<TBundle extends { name: string }>(
    packageConfig: PackageConfig,
    packtoryConfig: PacktoryConfigWithoutRegistry,
    existingBundles: readonly TBundle[]
): SharedPackageOptions<TBundle> {
    const sourcesFolder = resolveSourcesFolder(packageConfig, packtoryConfig);
    const mainPackageJson = resolveMainPackageJson(packageConfig, packtoryConfig);
    const bundleDependencies = resolveBundleDependencies(packageConfig, existingBundles);
    const normalizedRootEntries = getRequiredArrayValue(
        Object.entries(packageConfig.roots).map(([rootId, root]) => {
            return [rootId, normalizeRoot(root, sourcesFolder)] as const;
        }),
        `Package "${packageConfig.name}" must define at least one root`
    );

    const roots = Object.fromEntries(normalizedRootEntries) as ResourceResolveOptions['roots'];
    const rootIds = mapRequiredArrayValue(normalizedRootEntries, ([rootId]) => {
        return rootId;
    });
    const surface = resolveSurface(rootIds, packageConfig);

    return {
        name: packageConfig.name,
        exportPackageJson: packageConfig.exportPackageJson,
        roots,
        surface,
        sourcesFolder,
        includeSourceMapFiles: resolveIncludeSourceMapFiles(packageConfig, packtoryConfig),
        additionalFiles: resolveAdditionalFiles(packageConfig, sourcesFolder, packtoryConfig),
        mainPackageJson,
        additionalPackageJsonAttributes: buildAdditionalPackageJsonAttributes(packageConfig, packtoryConfig),
        allowMutableSpecifiers: resolveAllowMutableSpecifiers(packageConfig, packtoryConfig),
        deadCodeElimination: resolveDeadCodeElimination(packageConfig, packtoryConfig),
        ...bundleDependencies
    };
}

export function preparePackageOptions<TBundle extends { name: string }>(
    packageName: string,
    packageConfigs: PackageConfigsByName,
    packtoryConfig: PacktoryConfigWithoutRegistry,
    existingBundles: readonly TBundle[]
): PreparedPackageOptions<TBundle> {
    const packageConfig = getPackageConfig(packageName, packageConfigs);
    const sharedOptions = buildSharedOptions(packageConfig, packtoryConfig, existingBundles);
    const additionalChangelogSourceFiles = resolveAdditionalChangelogSourceFiles(packageConfig, packtoryConfig);
    const versioning = packageConfig.versioning ?? { automatic: true };

    return { additionalChangelogSourceFiles, packageConfig, sharedOptions, versioning };
}
