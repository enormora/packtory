import type { PackageConfig, PacktoryConfig, PacktoryConfigWithoutRegistry } from '../config/config.ts';
import type { MainPackageJson } from '../config/package-json.ts';
import type { AdditionalFileDescription } from '../config/additional-files.ts';
import type { RegistrySettings } from '../config/registry-settings.ts';
import type { VersioningSettings } from '../config/versioning-settings.ts';
import type { ResourceResolveOptions } from '../resource-resolver/resource-resolve-options.ts';
import type { BuildVersionedBundleOptions, VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import type { BundleSubstitutionSource } from '../linker/linked-bundle.ts';
import { normalizeAdditionalFile, normalizeEntryPoint } from './normalize-paths.ts';

type ManifestOptionsSubset = Pick<BuildVersionedBundleOptions, 'additionalPackageJsonAttributes' | 'mainPackageJson'>;
type SharedModuleResolution = ResourceResolveOptions['moduleResolution'];

type SharedPackageOptions<TBundle extends { name: string }> = ManifestOptionsSubset &
    ResourceResolveOptions & {
        readonly bundleDependencies: readonly TBundle[];
        readonly bundlePeerDependencies: readonly TBundle[];
    };

export type BuildOptions = SharedPackageOptions<VersionedBundleWithManifest> & {
    readonly version: string;
};

export type BuildAndPublishOptions = SharedPackageOptions<VersionedBundleWithManifest> & {
    readonly registrySettings: RegistrySettings;
    readonly versioning: VersioningSettings;
};

export type ResolveAndLinkOptions = SharedPackageOptions<BundleSubstitutionSource>;

function dependencyNamesToBundles<TBundle extends { name: string }>(
    dependencyNames: readonly string[],
    bundles: readonly TBundle[]
): readonly TBundle[] {
    const bundlesByName = new Map(
        bundles.map((bundle) => {
            return [bundle.name, bundle] as const;
        })
    );

    return dependencyNames.map((dependencyName) => {
        const matchingBundle = bundlesByName.get(dependencyName);
        if (matchingBundle === undefined) {
            throw new Error(`Dependent bundle "${dependencyName}" not found`);
        }
        return matchingBundle;
    });
}

function mergeAdditionalFiles(
    firstFiles: readonly AdditionalFileDescription[] = [],
    secondFiles: readonly AdditionalFileDescription[] = []
): readonly AdditionalFileDescription[] {
    const filesWithUniqueTargetPath = new Map<string, AdditionalFileDescription>();
    for (const file of firstFiles) {
        filesWithUniqueTargetPath.set(file.targetFilePath, file);
    }
    for (const file of secondFiles) {
        filesWithUniqueTargetPath.set(file.targetFilePath, file);
    }
    return Array.from(filesWithUniqueTargetPath.values());
}

type PreparedPackageOptions<TBundle extends { name: string }> = {
    readonly sharedOptions: SharedPackageOptions<TBundle>;
    readonly versioning: VersioningSettings;
};

function getPackageConfig(packageName: string, packageConfigs: Map<string, PackageConfig>): PackageConfig {
    const packageConfig = packageConfigs.get(packageName);

    if (packageConfig === undefined) {
        throw new Error(`Config for package "${packageName}" is missing`);
    }

    return packageConfig;
}

function getRequiredValue<TValue>(value: TValue | undefined, message: string): TValue {
    if (value === undefined) {
        throw new Error(message);
    }

    return value;
}

function resolveSourcesFolder(packageConfig: PackageConfig, packtoryConfig: PacktoryConfigWithoutRegistry): string {
    return getRequiredValue(
        packageConfig.sourcesFolder ?? packtoryConfig.commonPackageSettings?.sourcesFolder,
        `Config for package "${packageConfig.name}" is missing the sources folder`
    );
}

function resolveMainPackageJson(
    packageConfig: PackageConfig,
    packtoryConfig: PacktoryConfigWithoutRegistry
): MainPackageJson {
    return getRequiredValue(
        packageConfig.mainPackageJson ?? packtoryConfig.commonPackageSettings?.mainPackageJson,
        `Config for package "${packageConfig.name}" is missing the main package.json settings`
    );
}

function buildAdditionalPackageJsonAttributes(
    packageConfig: PackageConfig,
    packtoryConfig: PacktoryConfigWithoutRegistry
): ManifestOptionsSubset['additionalPackageJsonAttributes'] {
    return {
        ...packtoryConfig.commonPackageSettings?.additionalPackageJsonAttributes,
        ...packageConfig.additionalPackageJsonAttributes
    };
}

function resolveIncludeSourceMapFiles(
    packageConfig: PackageConfig,
    packtoryConfig: PacktoryConfigWithoutRegistry
): boolean {
    return packageConfig.includeSourceMapFiles ?? packtoryConfig.commonPackageSettings?.includeSourceMapFiles ?? false;
}

function resolveAdditionalFiles(
    packageConfig: PackageConfig,
    sourcesFolder: string,
    packtoryConfig: PacktoryConfigWithoutRegistry
): readonly AdditionalFileDescription[] {
    return mergeAdditionalFiles(
        packtoryConfig.commonPackageSettings?.additionalFiles,
        packageConfig.additionalFiles
    ).map((additionalFile) => {
        return normalizeAdditionalFile(additionalFile, sourcesFolder);
    });
}

function resolveBundleDependencies<TBundle extends { name: string }>(
    packageConfig: PackageConfig,
    existingBundles: readonly TBundle[]
): Pick<SharedPackageOptions<TBundle>, 'bundleDependencies' | 'bundlePeerDependencies'> {
    return {
        bundleDependencies: dependencyNamesToBundles(packageConfig.bundleDependencies ?? [], existingBundles),
        bundlePeerDependencies: dependencyNamesToBundles(packageConfig.bundlePeerDependencies ?? [], existingBundles)
    };
}

function buildSharedOptions<TBundle extends { name: string }>(
    packageConfig: PackageConfig,
    packtoryConfig: PacktoryConfigWithoutRegistry,
    existingBundles: readonly TBundle[]
): SharedPackageOptions<TBundle> {
    const sourcesFolder = resolveSourcesFolder(packageConfig, packtoryConfig);
    const mainPackageJson = resolveMainPackageJson(packageConfig, packtoryConfig);
    const bundleDependencies = resolveBundleDependencies(packageConfig, existingBundles);

    const [firstEntryPoint, ...remainingEntryPoints] = packageConfig.entryPoints;
    if (firstEntryPoint === undefined) {
        throw new Error(`Config for package "${packageConfig.name}" is missing entry points`);
    }

    const entryPoints: ResourceResolveOptions['entryPoints'] = [
        normalizeEntryPoint(firstEntryPoint, sourcesFolder),
        ...remainingEntryPoints.map((entryPoint) => {
            return normalizeEntryPoint(entryPoint, sourcesFolder);
        })
    ];

    return {
        name: packageConfig.name,
        entryPoints,
        sourcesFolder,
        includeSourceMapFiles: resolveIncludeSourceMapFiles(packageConfig, packtoryConfig),
        additionalFiles: resolveAdditionalFiles(packageConfig, sourcesFolder, packtoryConfig),
        moduleResolution: 'module' satisfies SharedModuleResolution,
        mainPackageJson,
        additionalPackageJsonAttributes: buildAdditionalPackageJsonAttributes(packageConfig, packtoryConfig),
        ...bundleDependencies
    };
}

function preparePackageOptions<TBundle extends { name: string }>(
    packageName: string,
    packageConfigs: Map<string, PackageConfig>,
    packtoryConfig: PacktoryConfigWithoutRegistry,
    existingBundles: readonly TBundle[]
): PreparedPackageOptions<TBundle> {
    const packageConfig = getPackageConfig(packageName, packageConfigs);
    const sharedOptions = buildSharedOptions(packageConfig, packtoryConfig, existingBundles);
    const versioning = packageConfig.versioning ?? { automatic: true };

    return { sharedOptions, versioning };
}

export function configToBuildAndPublishOptions(
    packageName: string,
    packageConfigs: Map<string, PackageConfig>,
    packtoryConfig: PacktoryConfig,
    existingBundles: readonly VersionedBundleWithManifest[]
): BuildAndPublishOptions {
    const { sharedOptions, versioning } = preparePackageOptions(
        packageName,
        packageConfigs,
        packtoryConfig,
        existingBundles
    );

    return {
        ...sharedOptions,
        versioning,
        registrySettings: packtoryConfig.registrySettings
    };
}

export function configToResolveAndLinkOptions(
    packageName: string,
    packageConfigs: Map<string, PackageConfig>,
    packtoryConfig: PacktoryConfigWithoutRegistry,
    existingBundles: readonly BundleSubstitutionSource[]
): ResolveAndLinkOptions {
    const { sharedOptions } = preparePackageOptions(packageName, packageConfigs, packtoryConfig, existingBundles);

    return sharedOptions;
}
