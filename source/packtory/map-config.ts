import { map } from 'effect/ReadonlyArray';
import type { Except } from 'type-fest';
import type { PackageConfig, PacktoryConfig } from '../config/config.ts';
import type { MainPackageJson } from '../config/package-json.ts';
import type { AdditionalFileDescription } from '../config/additional-files.ts';
import type { RegistrySettings } from '../config/registry-settings.ts';
import type { VersioningSettings } from '../config/versioning-settings.ts';
import type { ResourceResolveOptions } from '../resource-resolver/resource-resolve-options.ts';
import type { BuildVersionedBundleOptions, VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import { normalizeAdditionalFile, normalizeEntryPoint } from './normalize-paths.ts';

type AdditionalBuildOptions = {
    readonly version: string;
    readonly bundleDependencies: readonly VersionedBundleWithManifest[];
    readonly bundlePeerDependencies: readonly VersionedBundleWithManifest[];
};
type BuildOptionFromBuildVersion = Pick<
    BuildVersionedBundleOptions,
    'additionalPackageJsonAttributes' | 'mainPackageJson'
>;
export type BuildOptions = AdditionalBuildOptions & BuildOptionFromBuildVersion & ResourceResolveOptions;

export type BuildAndPublishOptions = Except<BuildOptions, 'version'> & {
    readonly registrySettings: RegistrySettings;
    readonly versioning: VersioningSettings;
};

function dependencyNamesToBundles(
    dependencyNames: readonly string[],
    bundles: readonly VersionedBundleWithManifest[]
): readonly VersionedBundleWithManifest[] {
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

// eslint-disable-next-line complexity -- needs to be refactored
export function configToBuildAndPublishOptions(
    packageName: string,
    packageConfigs: Map<string, PackageConfig>,
    packtoryConfig: PacktoryConfig,
    existingBundles: readonly VersionedBundleWithManifest[]
): BuildAndPublishOptions {
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
        ...remainingPackageConfig
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

    return {
        ...remainingPackageConfig,
        versioning,
        moduleResolution: mainPackageJson.type ?? 'module',
        additionalPackageJsonAttributes: {
            ...packtoryConfig.commonPackageSettings?.additionalPackageJsonAttributes,
            ...additionalPackageJsonAttributes
        },
        registrySettings: packtoryConfig.registrySettings,
        includeSourceMapFiles,
        entryPoints: map(entryPoints, (entryPoint) => {
            return normalizeEntryPoint(entryPoint, sourcesFolder);
        }),
        additionalFiles: uniqueAdditionalFiles.map((additionalFile) => {
            return normalizeAdditionalFile(additionalFile, sourcesFolder);
        }),
        mainPackageJson,
        sourcesFolder,
        bundleDependencies: dependencyNamesToBundles(bundleDependencies, existingBundles),
        bundlePeerDependencies: dependencyNamesToBundles(bundlePeerDependencies, existingBundles)
    };
}
