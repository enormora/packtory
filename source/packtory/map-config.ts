import { map } from 'effect/ReadonlyArray';
import type { BundleDescription } from '../bundler/bundle-description.js';
import type { PackageConfig, PacktoryConfig } from '../config/config.js';
import type { MainPackageJson } from '../config/package-json.js';
import type { BuildAndPublishOptions } from '../publisher/publisher.js';
import type { AdditionalFileDescription } from '../config/additional-files.js';
import { normalizeAdditionalFile, normalizeEntryPoint } from './normalize-paths.js';

function dependencyNamesToBundles(
    dependencyNames: readonly string[],
    bundles: readonly BundleDescription[]
): readonly BundleDescription[] {
    return dependencyNames.map((dependencyName) => {
        const matchingBundle = bundles.find((bundle) => {
            return bundle.packageJson.name === dependencyName;
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

export function configToBuildAndPublishOptions(
    packageName: string,
    packageConfigs: Map<string, PackageConfig>,
    packtoryConfig: PacktoryConfig,
    existingBundles: readonly BundleDescription[]
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
        includeSourceMapFiles = packtoryConfig.commonPackageSettings?.includeSourceMapFiles,
        additionalPackageJsonAttributes = {},
        ...remainingPackageConfig
    } = packageConfig;
    const mainPackageJson = (packtoryConfig.commonPackageSettings?.mainPackageJson ??
        mainPackageJsonFromPackageConfig) as MainPackageJson;
    const sourcesFolder = (packtoryConfig.commonPackageSettings?.sourcesFolder ??
        sourcesFolderFromPackageConfig) as string;

    const uniqueAdditionalFiles = mergeAdditionalFiles(
        packtoryConfig.commonPackageSettings?.additionalFiles,
        additionalFiles
    );

    return {
        ...remainingPackageConfig,
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
