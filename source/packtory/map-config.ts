import { map } from 'effect/ReadonlyArray';
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
    return dependencyNames.map((dependencyName) => {
        const matchingBundle = bundles.find((bundle) => {
            return bundle.name === dependencyName;
        });
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

// eslint-disable-next-line complexity -- needs to be refactored
function preparePackageOptions<TBundle extends { name: string }>(
    packageName: string,
    packageConfigs: Map<string, PackageConfig>,
    packtoryConfig: PacktoryConfigWithoutRegistry,
    existingBundles: readonly TBundle[]
): PreparedPackageOptions<TBundle> {
    const packageConfig = packageConfigs.get(packageName);

    if (packageConfig === undefined) {
        throw new Error(`Config for package "${packageName}" is missing`);
    }

    const {
        sourcesFolder: sourcesFolderFromPackageConfig,
        mainPackageJson: mainPackageJsonFromPackageConfig,
        bundleDependencies = [],
        bundlePeerDependencies = [],
        entryPoints,
        additionalFiles,
        includeSourceMapFiles = packtoryConfig.commonPackageSettings?.includeSourceMapFiles ?? false,
        additionalPackageJsonAttributes = {},
        versioning = { automatic: true },
        name
    } = packageConfig;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- ok in this case
    const mainPackageJson = (packtoryConfig.commonPackageSettings?.mainPackageJson ??
        mainPackageJsonFromPackageConfig) as MainPackageJson;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- ok in this case
    const sourcesFolder = (packtoryConfig.commonPackageSettings?.sourcesFolder ??
        sourcesFolderFromPackageConfig) as string;

    const uniqueAdditionalFiles = mergeAdditionalFiles(
        packtoryConfig.commonPackageSettings?.additionalFiles,
        additionalFiles
    );

    const sharedOptions: SharedPackageOptions<TBundle> = {
        name,
        entryPoints: map(entryPoints, (entryPoint) => {
            return normalizeEntryPoint(entryPoint, sourcesFolder);
        }),
        sourcesFolder,
        includeSourceMapFiles,
        additionalFiles: uniqueAdditionalFiles.map((additionalFile) => {
            return normalizeAdditionalFile(additionalFile, sourcesFolder);
        }),
        moduleResolution: mainPackageJson.type ?? 'module',
        mainPackageJson,
        additionalPackageJsonAttributes: {
            ...packtoryConfig.commonPackageSettings?.additionalPackageJsonAttributes,
            ...additionalPackageJsonAttributes
        },
        bundleDependencies: dependencyNamesToBundles(bundleDependencies, existingBundles),
        bundlePeerDependencies: dependencyNamesToBundles(bundlePeerDependencies, existingBundles)
    };

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
